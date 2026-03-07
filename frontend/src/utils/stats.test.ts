import { describe, it, expect } from 'vitest';
import { normalizeWeights, computeStats, buildSupplyCurveSteps, computeEconomicCutoffX, buildEconomicAreaPolygon } from './stats';

describe('normalizeWeights', () => {
    it('should normalize weights to sum to 100 with last item balancing', () => {
        const result = normalizeWeights([30, 50, 20], 1);
        expect(result).toEqual([30, 50, 20]);
    });
    it('should clamp the edited weight if sum exceeds 100', () => {
        const result = normalizeWeights([30, 100, 40], 1);
        expect(result).toEqual([30, 70, 0]);
    });
    it('should force changed weight into [0, 100] bounds or clamp it', () => {
        const result = normalizeWeights([33, 33, 150], 2);
        expect(result).toEqual([0, 33, 67]);

        const result2 = normalizeWeights([-10, 33, 34], 0);
        expect(result2).toEqual([0, 33, 67]);
    });
});

describe('computeStats', () => {
    it('should compute correct summary statistics', () => {
        const data = [1, 2, 3, 4, 5];
        const stats = computeStats(data);
        expect(stats.min).toBe(1);
        expect(stats.max).toBe(5);
        expect(stats.median).toBe(3);
        expect(stats.q1).toBe(2);
        expect(stats.q3).toBe(4);
    });
    it('should handle empty arrays', () => {
        const stats = computeStats([]);
        expect(stats.min).toBe(null);
        expect(stats.max).toBe(null);
        expect(stats.median).toBe(null);
    });
});

describe('buildSupplyCurveSteps', () => {
    it('should build staircase structure from curve points', () => {
        const input = [
            { cce: 10, savings: 100, label: 'A', units: 'MWh' },
            { cce: 20, savings: 50, label: 'B', units: 'MWh' }
        ];
        const res = buildSupplyCurveSteps(input);

        // Two points per input, so total 4 points
        expect(res.length).toBe(4);

        // Level 1: A
        expect(res[0].x).toBe(0);
        expect(res[0].y).toBe(10);
        expect(res[0].isEdge).toBe(true);

        expect(res[1].x).toBe(100);
        expect(res[1].y).toBe(10);
        expect(res[1].isEdge).toBe(false);

        // Level 2: B
        expect(res[2].x).toBe(100); // starts exactly at previous cumulative X
        expect(res[2].y).toBe(20); // with new Y
        expect(res[2].isEdge).toBe(true);

        expect(res[3].x).toBe(150);
        expect(res[3].y).toBe(20);
        expect(res[3].isEdge).toBe(false);
    });

    it('should produce 2*n step points', () => {
        const input = [
            { cce: 1, savings: 2, label: 'A' },
            { cce: 2, savings: 3, label: 'B' },
            { cce: 5, savings: 1, label: 'C' },
        ];
        const res = buildSupplyCurveSteps(input);
        expect(res.length).toBe(6); // 2 * 3 = 6
    });
});

describe('computeEconomicCutoffX', () => {
    it('should compute x_cutoff = 5 for [(2,1),(3,2),(1,5)] at marketPrice=2', () => {
        const measures = [
            { savings: 2, cce: 1 },
            { savings: 3, cce: 2 },
            { savings: 1, cce: 5 },
        ];
        const { cutoffX, economicCount } = computeEconomicCutoffX(measures, 2);
        expect(cutoffX).toBe(5);       // 2 + 3 = 5 (first two are <= 2)
        expect(economicCount).toBe(2);
    });

    it('should return 0 when no measure is below market price', () => {
        const measures = [
            { savings: 2, cce: 10 },
            { savings: 3, cce: 20 },
        ];
        const { cutoffX, economicCount } = computeEconomicCutoffX(measures, 5);
        expect(cutoffX).toBe(0);
        expect(economicCount).toBe(0);
    });

    it('should include all measures when all are below market price', () => {
        const measures = [
            { savings: 2, cce: 1 },
            { savings: 3, cce: 2 },
        ];
        const { cutoffX, economicCount } = computeEconomicCutoffX(measures, 100);
        expect(cutoffX).toBe(5);
        expect(economicCount).toBe(2);
    });

    it('should filter out invalid measures', () => {
        const measures = [
            { savings: 0, cce: 1 },  // zero savings, filtered
            { savings: 3, cce: 2 },
        ];
        const { cutoffX, economicCount } = computeEconomicCutoffX(measures, 100);
        expect(cutoffX).toBe(3);
        expect(economicCount).toBe(1);
    });
});

describe('buildEconomicAreaPolygon', () => {
    it('should build polygon ending at x=cutoff', () => {
        const measures = [
            { cce: 1, savings: 2, label: 'A' },
            { cce: 2, savings: 3, label: 'B' },
            { cce: 5, savings: 1, label: 'C' },
        ];
        const steps = buildSupplyCurveSteps(measures);
        const polygon = buildEconomicAreaPolygon(steps, 5);

        // Polygon should start at (0,0) and end at (5,0)
        expect(polygon[0]).toEqual({ x: 0, y: 0 });
        expect(polygon[polygon.length - 1]).toEqual({ x: 5, y: 0 });

        // Should contain step points up to x=5
        expect(polygon.some(p => p.x === 5)).toBe(true);
    });

    it('should return empty polygon for cutoffX=0', () => {
        const steps = buildSupplyCurveSteps([{ cce: 10, savings: 5, label: 'A' }]);
        const polygon = buildEconomicAreaPolygon(steps, 0);
        expect(polygon).toEqual([]);
    });
});
