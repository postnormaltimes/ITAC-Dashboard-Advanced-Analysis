import React from 'react';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine, Area, ComposedChart, Label, Line,
} from 'recharts';
import { Paper, Typography } from '@mui/material';
import {
    buildSupplyCurveSteps,
    computeEconomicCutoffX,
} from '../../utils/stats';

export interface SupplyCurveItem {
    savings: number; // GJ_primary (width)
    cce: number;     // $/GJ_primary (height)
    label: string;
    id: string;
}

interface SupplyCurveChartProps {
    items: SupplyCurveItem[];
    marketPrice: number;
    title?: string;
    xLabel?: string;
    yLabel?: string;
    height?: number;
}

/**
 * Shared supply curve chart used in Steps 7 and 9.
 * Renders a true staircase (step function) with:
 * - Horizontal segments for each measure (width = savings, height = CCE)
 * - Vertical jumps at measure boundaries
 * - A horizontal dashed market price line
 * - Green fill for the economic potential region (CCE <= market price)
 */
const SupplyCurveChart: React.FC<SupplyCurveChartProps> = ({
    items,
    marketPrice,
    title = 'Cost of Conserved Energy Supply Curve',
    xLabel = 'Cumulative Primary Energy Saved (GJ)',
    yLabel = 'CCE ($/GJ primary)',
    height = 420,
}) => {
    // 1. Build staircase points
    const measureItems = items.map(i => ({ savings: i.savings, cce: i.cce, label: i.label }));
    const stepPoints = buildSupplyCurveSteps(measureItems);

    // 2. Find the economic cutoff x
    const { cutoffX } = computeEconomicCutoffX(measureItems, marketPrice);

    // 3. Build chart data: each step point with an additional "economic" y field
    //    for the filled area (set to 0 for x > cutoffX).
    const chartData = stepPoints.map(pt => ({
        x: pt.x,
        cce: pt.y,
        economic: pt.x <= cutoffX ? pt.y : null,
        label: pt.label,
    }));

    // If the cutoff falls within the curve, insert a point at the boundary
    // to ensure a clean vertical drop for the economic area fill.
    if (cutoffX > 0 && cutoffX < (stepPoints.length > 0 ? stepPoints[stepPoints.length - 1].x : 0)) {
        // Find the step at cutoffX
        const atCutoff = stepPoints.find(pt => pt.x === cutoffX);
        if (atCutoff) {
            // Insert a null-economic point right after cutoffX
            const idx = chartData.findIndex(d => d.x === cutoffX && d.economic !== null);
            if (idx >= 0 && idx < chartData.length - 1) {
                // The point after this one should have economic = null (already set by logic above)
            }
        }
    }

    const maxX = stepPoints.length > 0 ? stepPoints[stepPoints.length - 1].x : 1;
    const maxY = stepPoints.length > 0 ? Math.max(...stepPoints.map(p => p.y), marketPrice * 1.3) : 1;

    if (stepPoints.length === 0) {
        return (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">No data available for supply curve</Typography>
            </Paper>
        );
    }

    return (
        <Paper sx={{ p: 2 }}>
            {title && <Typography variant="subtitle1" gutterBottom>{title}</Typography>}
            <ResponsiveContainer width="100%" height={height}>
                <ComposedChart data={chartData} margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                        dataKey="x"
                        type="number"
                        domain={[0, maxX * 1.05]}
                        tick={{ fontSize: 10 }}
                    >
                        <Label value={xLabel} position="insideBottom" offset={-15} />
                    </XAxis>
                    <YAxis
                        domain={[Math.min(0, ...stepPoints.map(p => p.y)), maxY * 1.1]}
                        tick={{ fontSize: 10 }}
                    >
                        <Label value={yLabel} angle={-90} position="insideLeft" offset={-5} />
                    </YAxis>
                    <Tooltip
                        formatter={(value: string | number | undefined) => {
                            if (value == null) return ['—', 'CCE'];
                            return [`$${Number(value).toFixed(2)}/GJ`, 'CCE'];
                        }}
                        labelFormatter={(val) => `@ ${Number(val).toFixed(1)} GJ`}
                    />

                    {/* Economic area fill (green) — must come before the line */}
                    <Area
                        type="stepAfter"
                        dataKey="economic"
                        stroke="none"
                        fill="#4caf50"
                        fillOpacity={0.15}
                        isAnimationActive={false}
                        connectNulls={false}
                        dot={false}
                        activeDot={false}
                    />

                    {/* Main staircase line */}
                    <Line
                        type="stepAfter"
                        dataKey="cce"
                        stroke="#1a237e"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                        activeDot={{ r: 4, fill: '#1a237e' }}
                    />

                    {/* Market price reference line */}
                    <ReferenceLine
                        y={marketPrice}
                        stroke="#e53935"
                        strokeDasharray="8 4"
                        strokeWidth={1.5}
                    >
                        <Label
                            value={`Market Price: $${marketPrice.toFixed(2)}/GJ`}
                            position="right"
                            fill="#e53935"
                            fontSize={11}
                        />
                    </ReferenceLine>
                </ComposedChart>
            </ResponsiveContainer>
        </Paper>
    );
};

export default SupplyCurveChart;
