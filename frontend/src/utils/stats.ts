export function normalizeWeights(weights: number[], editedIndex: number): number[] {
    // Strategy 1: Last criterion auto-balances.
    // Ensure all are integers > 0.
    const newWeights = [...weights].map(w => Math.max(0, Math.round(w)));

    if (editedIndex === newWeights.length - 1) {
        // If they edited the last one, we just accept it (clamped to 0-100)
        // and let the user figure out the rest, OR we balance the first one.
        // The prompt said: "User edits any weight i except the last -> update lastWeight.
        // If they edit the last, let's balance the first available (e.g. index 0).
        newWeights[editedIndex] = Math.min(100, newWeights[editedIndex]);

        let sumOthers = 0;
        for (let i = 1; i < newWeights.length - 1; i++) {
            sumOthers += newWeights[i];
        }

        const remainder = 100 - newWeights[editedIndex] - sumOthers;
        if (remainder < 0) {
            // we have to clamp the edited one if it forces negative
            newWeights[editedIndex] = Math.max(0, 100 - sumOthers);
            newWeights[0] = 0;
        } else {
            newWeights[0] = remainder;
        }
    } else {
        // They edited a non-last weight.
        const lastIndex = newWeights.length - 1;

        let sumOthers = 0;
        for (let i = 0; i < lastIndex; i++) {
            sumOthers += newWeights[i];
        }

        if (sumOthers > 100) {
            // Clamp the edited one so sumOthers == 100
            const excess = sumOthers - 100;
            newWeights[editedIndex] = Math.max(0, newWeights[editedIndex] - excess);
            sumOthers = 100;
        }

        newWeights[lastIndex] = 100 - sumOthers;
    }

    return newWeights;
}

export function computeStats(values: number[]): { min: number | null, max: number | null, median: number | null, stdev: number | null, q1: number | null, q3: number | null } {
    if (!values || values.length === 0) return { min: null, max: null, median: null, stdev: null, q1: null, q3: null };
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    // Percentile helper
    const getPercentile = (p: number) => {
        const index = p * (n - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        if (upper >= n) return sorted[lower];
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    };

    const q1 = getPercentile(0.25);
    const median = getPercentile(0.5);
    const q3 = getPercentile(0.75);
    const min = sorted[0];
    const max = sorted[n - 1];

    // standard deviation (sample)
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    let variance = 0;
    if (n > 1) {
        variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n - 1);
    }
    const stdev = Math.sqrt(variance);

    return { min, max, median, stdev, q1, q3 };
}

export interface HistogramResult {
    bins: { x0: number; x1: number; count: number; label: string }[];
    excludedCount: number;
}

export function computeHistogram(values: number[]): HistogramResult {
    const validValues = values.filter(v => typeof v === 'number' && !isNaN(v) && isFinite(v));
    const excludedCount = values.length - validValues.length;

    if (validValues.length === 0) {
        return { bins: [], excludedCount };
    }

    const { min, max, q1, q3 } = computeStats(validValues);
    const n = validValues.length;
    const iqr = q3 - q1;

    let numBins = 10;
    if (iqr > 0) {
        // Freedman-Diaconis
        const binWidth = 2 * iqr * Math.pow(n, -1 / 3);
        if (binWidth > 0) {
            numBins = Math.ceil((max - min) / binWidth);
        }
    } else if (n > 0) {
        // Sturges
        numBins = Math.ceil(Math.log2(n) + 1);
    }

    // Clamp bins
    numBins = Math.max(8, Math.min(30, numBins));

    // Handle single unique value edge case
    let safeMin = min;
    let safeMax = max;
    if (min === max) {
        safeMin = min - 1;
        safeMax = min + 1;
        numBins = 8;
    }

    const binWidth = (safeMax - safeMin) / numBins;

    // Initialize bins
    const bins = Array.from({ length: numBins }).map((_, i) => ({
        x0: safeMin + i * binWidth,
        x1: safeMin + (i + 1) * binWidth,
        count: 0,
        label: `${(safeMin + i * binWidth).toFixed(1)} - ${(safeMin + (i + 1) * binWidth).toFixed(1)}`
    }));

    // Assign counts
    for (const val of validValues) {
        let binIdx = Math.floor((val - safeMin) / binWidth);
        if (binIdx >= numBins) binIdx = numBins - 1; // inclusive upper bound for max
        if (binIdx < 0) binIdx = 0;
        bins[binIdx].count++;
    }

    return { bins, excludedCount };
}

export interface SupplyCurvePoint {
    x: number;
    y: number;
    label?: string;
    width?: number; // delta x
    isEdge?: boolean; // useful if you want to know it's a vertical drop
    units?: string;
}

export function buildSupplyCurveSteps(items: { savings: number; cce: number; label: string; units?: string }[]): SupplyCurvePoint[] {
    // 1. Filter out invalid/zero savings and valid CCE
    const validItems = items.filter(
        i => i.savings > 0 && typeof i.cce === 'number' && !isNaN(i.cce) && isFinite(i.cce)
    );

    // 2. Sort by CCE ascending. Tie-breaker: larger savings first.
    validItems.sort((a, b) => {
        if (a.cce !== b.cce) return a.cce - b.cce;
        return b.savings - a.savings;
    });

    // 3. Build step points
    const points: SupplyCurvePoint[] = [];
    let currentX = 0;

    for (const item of validItems) {
        const height = item.cce;
        const width = item.savings;

        // Start point of the segment
        points.push({
            x: currentX,
            y: height,
            label: item.label,
            width: width,
            isEdge: true,
            units: item.units
        });

        // End point of the segment
        points.push({
            x: currentX + width,
            y: height,
            label: item.label,
            width: width,
            isEdge: false,
            units: item.units
        });

        currentX += width;
    }

    return points;
}

/**
 * Given measures sorted by CCE and a market price, find the x position
 * where the curve first exceeds the market price (the economic boundary).
 * Since the curve is stepwise, intersection is at the boundary of the last
 * measure where cce <= marketPrice.
 */
export function computeEconomicCutoffX(
    measures: { savings: number; cce: number }[],
    marketPrice: number
): { cutoffX: number; economicCount: number } {
    // Filter and sort same as buildSupplyCurveSteps
    const valid = measures
        .filter(m => m.savings > 0 && typeof m.cce === 'number' && !isNaN(m.cce) && isFinite(m.cce))
        .sort((a, b) => {
            if (a.cce !== b.cce) return a.cce - b.cce;
            return b.savings - a.savings;
        });

    let cutoffX = 0;
    let economicCount = 0;
    for (const m of valid) {
        if (m.cce <= marketPrice) {
            cutoffX += m.savings;
            economicCount++;
        } else {
            break;
        }
    }
    return { cutoffX, economicCount };
}

/**
 * Build a closed polygon for the economic region (where CCE <= marketPrice).
 * The polygon starts at (0,0), follows the staircase up to x_cutoff,
 * then drops back to (x_cutoff, 0) and closes to (0, 0).
 */
export function buildEconomicAreaPolygon(
    stepPoints: SupplyCurvePoint[],
    cutoffX: number
): { x: number; y: number }[] {
    if (stepPoints.length === 0 || cutoffX <= 0) return [];

    const polygon: { x: number; y: number }[] = [{ x: 0, y: 0 }];

    for (const pt of stepPoints) {
        if (pt.x > cutoffX) break;
        polygon.push({ x: pt.x, y: pt.y });
    }

    // Close polygon: drop to (cutoffX, 0)
    const lastPt = polygon[polygon.length - 1];
    if (lastPt.x < cutoffX) {
        // The cutoff is mid-step; extend horizontally to cutoffX at the same height
        polygon.push({ x: cutoffX, y: lastPt.y });
    }
    polygon.push({ x: cutoffX, y: 0 });

    return polygon;
}

