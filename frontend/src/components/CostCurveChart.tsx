
import React, { useMemo } from 'react';
import { Box, Typography, Paper, CircularProgress } from '@mui/material';
import type { CostCurveResponse, CostCurvePoint } from '../types';

// Plotly Factory Pattern to avoid "document is not defined" or build issues
// @ts-expect-error: Plotly types are missing
import Plotly from 'plotly.js-dist-min';
// @ts-expect-error: Plotly factory types are missing
import createPlotlyComponent from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = createPlotlyComponent(Plotly as any);

interface CostCurveChartProps {
    data: CostCurveResponse | null;
    isLoading: boolean;
}

const CostCurveChart: React.FC<CostCurveChartProps> = ({ data, isLoading }) => {
    const chartData = useMemo(() => {
        if (!data || !data.demand_curve) return [];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const traces: any[] = [];

        // 1. Demand Side Cost Curve (Step Chart)
        // We use a Bar chart for simplicity to show width = savings, height = CCE
        // But Plotly Bar widths are tricky.
        // Better: Scatter with 'hv' line shape (stepped) and fill='tozeroy'
        // X-axis: Cumulative Savings. Y-axis: CCE.

        const xValues: number[] = [];
        const yValues: number[] = [];
        const hoverTexts: string[] = [];

        // We need to construct the step function points
        // For each measure: (start_x, cce), (end_x, cce)
        // start_x = cumulative_savings - savings

        data.demand_curve.forEach((point: CostCurvePoint) => {
            // Check for valid numbers
            const savings = typeof point.savings === 'number' ? point.savings : 0;
            const cce = typeof point.cce === 'number' ? point.cce : 0;

            // For a true step chart area:
            // Point 1: (prev_cumulative, cce)
            // Point 2: (current_cumulative, cce)
            const prevCumulative = (point.cumulative_savings || 0) - savings;

            xValues.push(prevCumulative);
            yValues.push(cce);
            hoverTexts.push(`${point.label || 'Unknown'}<br>Savings: ${savings.toFixed(0)} MWh<br>CCE: $${cce.toFixed(3)}/kWh`);

            xValues.push(point.cumulative_savings || 0);
            yValues.push(cce);
            hoverTexts.push(`${point.label || 'Unknown'}<br>Savings: ${savings.toFixed(0)} MWh<br>CCE: $${cce.toFixed(3)}/kWh`);
        });

        // Add a line trace for the curve
        traces.push({
            x: xValues,
            y: yValues,
            text: hoverTexts,
            hoverinfo: 'text',
            mode: 'lines',
            fill: 'tozeroy', // Create the area effect
            line: { shape: 'hv', color: '#1976d2', width: 2 },
            name: 'Energy Efficiency Measures'
        });

        // 2. Supply Side Benchmarks (Horizontal Lines)
        if (data.supply_benchmarks) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.supply_benchmarks.forEach((benchmark: any) => {
                const price = benchmark.value as number;
                const name = benchmark.label as string;

                // Extend line across the whole x-axis range
                const maxX = xValues.length > 0 ? xValues[xValues.length - 1] : 0;
                // Add 10% buffer
                const rangeX = maxX * 1.1;

                traces.push({
                    x: [0, rangeX],
                    y: [price, price],
                    mode: 'lines',
                    line: { dash: 'dash', width: 2 }, // Different colors/styles could be auto-assigned
                    name: `${name} ($${(price || 0).toFixed(3)}/kWh)`
                });
            });
        }

        return traces;
    }, [data]);

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 500 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!data || !data.demand_curve || data.demand_curve.length === 0) {
        return (
            <Paper sx={{ p: 4, height: 500, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                <Typography variant="body1" color="textSecondary">
                    No data available for the selected filters.
                </Typography>
            </Paper>
        );
    }

    return (
        <Paper elevation={2} sx={{ p: 2, mt: 2, height: 600 }}>
            {/* We must wrap Plot in a responsive container or handle resize explicitly */}
            <Typography variant="h6" gutterBottom>Supply-Demand Cost Curve</Typography>
            <Box sx={{ width: '100%', height: 'calc(100% - 40px)' }}>
                <Plot
                    data={chartData}
                    layout={{
                        autosize: true,
                        margin: { l: 60, r: 20, t: 20, b: 60 },
                        xaxis: {
                            title: 'Cumulative Annual Energy Savings (MWh)',
                            rangemode: 'tozero'
                        },
                        yaxis: {
                            title: 'Cost of Conserved Energy ($/kWh)',
                            rangemode: 'tozero'
                        },
                        legend: { orientation: 'h', y: 1.1 },
                        hovermode: 'closest'
                    }}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                    config={{ responsive: true, displayModeBar: true }}
                />
            </Box>
        </Paper>
    );
};

export default CostCurveChart;
