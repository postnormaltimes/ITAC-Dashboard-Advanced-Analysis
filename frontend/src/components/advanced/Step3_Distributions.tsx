import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, CircularProgress, Stack } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { api } from '../../api/client';
import type { AdvancedMeasure, HistogramData } from '../../types';

interface Step3Props {
    naicsCode: string;
    measures: AdvancedMeasure[];
    onBack: () => void;
    onNext: () => void;
}

const EMPLOYEE_THRESHOLDS = [
    { value: 10, label: '10', color: '#ff9800' },
    { value: 50, label: '50', color: '#2196f3' },
    { value: 250, label: '250', color: '#9c27b0' },
];

const SALES_THRESHOLDS = [
    { value: 2_000_000, label: '2M', color: '#ff9800' },
    { value: 10_000_000, label: '10M', color: '#2196f3' },
    { value: 50_000_000, label: '50M', color: '#9c27b0' },
];

const Step3_Distributions: React.FC<Step3Props> = ({ naicsCode, measures, onBack, onNext }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<{ employees: HistogramData, sales: HistogramData } | null>(null);

    useEffect(() => {
        let mounted = true;
        const loadData = async () => {
            try {
                const topMeasures = measures.slice(0, 50).map(m => m.arc);
                const res = await api.getAdvancedStep2(naicsCode, topMeasures);
                if (mounted) setData(res);
            } catch (err) {
                console.error(err);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        loadData();
        return () => { mounted = false; };
    }, [naicsCode, measures]);

    // Build histogram data with numeric bin centers for proper ReferenceLine positioning
    const formatHistogramNumeric = (hist: HistogramData, divisor: number = 1) => {
        if (!hist || !hist.bin_edges || hist.bin_edges.length < 2) return [];
        return hist.counts.map((count, i) => {
            const lo = hist.bin_edges[i] / divisor;
            const hi = hist.bin_edges[i + 1] / divisor;
            return {
                binCenter: (lo + hi) / 2,
                binLabel: `${Math.round(lo)}–${Math.round(hi)}`,
                count,
            };
        });
    };

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
    if (!data) return <Box sx={{ p: 4, textAlign: 'center' }}>Failed to load distributions.</Box>;

    const empData = formatHistogramNumeric(data.employees);
    const salesData = formatHistogramNumeric(data.sales, 1_000_000); // Display in millions

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 3: Distribution Analysis</Typography>
                    <Typography color="text.secondary">
                        Analyzing firm profiles. Dotted lines show firm-size category boundaries.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="contained" onClick={onNext}>Next: Cluster Def</Button>
                </Box>
            </Box>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="h6" gutterBottom>Employees Distribution</Typography>
                    <Box sx={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={empData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="binCenter" type="number"
                                    tick={{ fontSize: 10 }}
                                    label={{ value: 'Employees', position: 'insideBottom', offset: -5 }}
                                />
                                <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                                <Tooltip
                                    labelFormatter={(_val, payload) => {
                                        const item = payload?.[0]?.payload;
                                        return item?.binLabel || '';
                                    }}
                                />
                                <Bar dataKey="count" fill="#2c3e50" name="Firms" />
                                {EMPLOYEE_THRESHOLDS.map(t => (
                                    <ReferenceLine
                                        key={t.value} x={t.value}
                                        stroke={t.color} strokeDasharray="5 5" strokeWidth={1.5}
                                        label={{ value: t.label, fill: t.color, fontSize: 11, position: 'top' }}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </Box>
                </Paper>

                <Paper sx={{ p: 2, flex: 1 }}>
                    <Typography variant="h6" gutterBottom>Annual Sales Distribution ($M)</Typography>
                    <Box sx={{ height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="binCenter" type="number"
                                    tick={{ fontSize: 10 }}
                                    label={{ value: 'Sales ($M)', position: 'insideBottom', offset: -5 }}
                                />
                                <YAxis label={{ value: 'Count', angle: -90, position: 'insideLeft' }} />
                                <Tooltip
                                    labelFormatter={(_val, payload) => {
                                        const item = payload?.[0]?.payload;
                                        return item ? `$${item.binLabel}M` : '';
                                    }}
                                />
                                <Bar dataKey="count" fill="#27ae60" name="Firms" />
                                {SALES_THRESHOLDS.map(t => (
                                    <ReferenceLine
                                        key={t.value} x={t.value / 1_000_000}
                                        stroke={t.color} strokeDasharray="5 5" strokeWidth={1.5}
                                        label={{ value: t.label, fill: t.color, fontSize: 11, position: 'top' }}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </Box>
                </Paper>
            </Stack>
        </Box>
    );
};

export default Step3_Distributions;
