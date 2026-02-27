
import React, { useEffect, useState } from 'react';
import { Grid, Paper, Typography, Box, CircularProgress } from '@mui/material';
import type { SearchFilters, AnalyticsChartsResponse } from '../types';
import { api } from '../api/client';
// @ts-expect-error: Plotly types are missing or incompatible
import Plotly from 'plotly.js-dist-min';
// @ts-expect-error: Plotly factory types are missing
import createPlotlyComponent from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = createPlotlyComponent(Plotly as any);

interface VisualAnalyticsProps {
    filters: SearchFilters;
}

const VisualAnalytics: React.FC<VisualAnalyticsProps> = ({ filters }) => {
    const [data, setData] = useState<AnalyticsChartsResponse | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchCharts = async () => {
            setLoading(true);
            try {
                const chartData = await api.getCharts(filters);
                setData(chartData);
            } catch (error) {
                console.error("Failed to fetch chart data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCharts();
    }, [filters]);

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    if (!data) return <Typography>No data available</Typography>;

    return (
        <Box sx={{ p: 2 }}>
            <Grid container spacing={3}>
                {/* Savings by ARC (Top 10) */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 2, height: 400 }}>
                        <Typography variant="h6" gutterBottom>Top 10 Savings Opportunities (ARC)</Typography>
                        <Plot
                            data={[{
                                x: data.savings_by_arc.map(d => d.value),
                                y: data.savings_by_arc.map(d => d.label),
                                type: 'bar',
                                orientation: 'h',
                                marker: { color: '#1976d2' }
                            }]}
                            layout={{
                                autosize: true,
                                margin: { l: 150, r: 20, t: 20, b: 40 },
                                yaxis: { automargin: true }
                            }}
                            useResizeHandler={true}
                            style={{ width: '100%', height: '100%' }}
                            config={{ responsive: true, displayModeBar: false }}
                        />
                    </Paper>
                </Grid>

                {/* Savings by Payback Period */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 2, height: 400 }}>
                        <Typography variant="h6" gutterBottom>Savings by Payback Period</Typography>
                        <Plot
                            data={[{
                                x: data.savings_by_payback.map(d => d.label),
                                y: data.savings_by_payback.map(d => d.value),
                                type: 'bar',
                                marker: { color: '#2e7d32' }
                            }]}
                            layout={{
                                autosize: true,
                                margin: { l: 50, r: 20, t: 20, b: 40 },
                                xaxis: { title: 'Payback Period' },
                                yaxis: { title: 'Total Savings ($)' }
                            }}
                            useResizeHandler={true}
                            style={{ width: '100%', height: '100%' }}
                            config={{ responsive: true, displayModeBar: false }}
                        />
                    </Paper>
                </Grid>

                {/* Savings by State (Map or Bar) */}
                <Grid size={{ xs: 12 }}>
                    <Paper sx={{ p: 2, height: 500 }}>
                        <Typography variant="h6" gutterBottom>Savings by State</Typography>
                        <Plot
                            data={[{
                                locations: data.savings_by_state.map(d => d.label),
                                z: data.savings_by_state.map(d => d.value),
                                locationmode: 'USA-states',
                                type: 'choropleth',
                                colorscale: 'Blues',
                                colorbar: { title: 'Savings ($)' }
                            }]}
                            layout={{
                                autosize: true,
                                geo: { scope: 'usa' },
                                margin: { l: 0, r: 0, t: 0, b: 0 }
                            }}
                            useResizeHandler={true}
                            style={{ width: '100%', height: '100%' }}
                            config={{ responsive: true, displayModeBar: false }}
                        />
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default VisualAnalytics;
