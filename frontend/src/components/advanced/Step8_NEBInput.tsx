import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, TextField, Alert } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../../api/client';
import type { AdvancedMeasure, FirmSizeCategory, NEBMeasureDetail } from '../../types';
import { sanitizeMeasureDescription } from '../../utils/text';
import { computeHistogram, computeStats } from '../../utils/stats';

interface Step8Props {
    naicsCode: string;
    measures: AdvancedMeasure[];
    selectedMeasureIds: string[];
    selectedCategories: FirmSizeCategory[];
    nebInputs: Record<string, { opCost: number, nebValue: number }>;
    setNebInputs: React.Dispatch<React.SetStateAction<Record<string, { opCost: number, nebValue: number }>>>;
    onBack: () => void;
    onNext: () => void;
}

const Step8_NEBInput: React.FC<Step8Props> = ({ naicsCode, selectedMeasureIds, selectedCategories, nebInputs, setNebInputs, onBack, onNext }) => {
    const [loading, setLoading] = useState(true);
    const [nebData, setNebData] = useState<NEBMeasureDetail[]>([]);
    const [activeMeasure, setActiveMeasure] = useState<string>('');

    useEffect(() => {
        let mounted = true;
        api.getNEBDetails(naicsCode, selectedMeasureIds, selectedCategories)
            .then(d => {
                if (mounted) {
                    setNebData(d.measures);
                    if (d.measures.length > 0) setActiveMeasure(d.measures[0].arc);
                }
            })
            .catch(console.error)
            .finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, [naicsCode, selectedMeasureIds, selectedCategories]);

    const handleInputChange = (arc: string, field: 'opCost' | 'nebValue', value: number) => {
        setNebInputs(prev => ({
            ...prev,
            [arc]: { ...prev[arc] || { opCost: 0, nebValue: 0 }, [field]: value }
        }));
    };

    const fmt = (v: number | null | undefined) => v != null ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—';

    /** Returns 'error.main' for negative, 'success.main' for positive, undefined for zero/null */
    const nebColor = (v: number | null | undefined): string | undefined => {
        if (v == null || v === 0) return undefined;
        return v < 0 ? 'error.main' : 'success.main';
    };

    const activeData = nebData.find(m => m.arc === activeMeasure);

    const renderDistribution = (values: number[], title: string, color: string) => {
        if (!values?.length) return null;
        const hist = computeHistogram(values);
        const stats = computeStats(values);
        return (
            <Paper sx={{ p: 2, flex: '1 1 250px' }}>
                <Typography variant="subtitle2" gutterBottom>{title}</Typography>
                <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={hist.bins}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill={color} />
                    </BarChart>
                </ResponsiveContainer>
                <Typography variant="caption" color="text.secondary">
                    Median: {stats.median !== null ? `$${stats.median.toFixed(0)}` : 'N/A'} | N: {values.length}
                </Typography>
            </Paper>
        );
    };

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h5">Step 10: Non-Energy Benefits</Typography>
                    <Typography color="text.secondary">
                        Review or enter monetized secondary impacts like operation/maintenance cost changes and non-energy benefits (NEBs) for the selected measures.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="contained" onClick={onNext}>Next: Gap Analysis</Button>
                </Box>
            </Box>

            <Alert severity="info" sx={{ mb: 2 }}>
                <strong>N.B.</strong> Negative values (shown in <span style={{ color: '#d32f2f', fontWeight: 600 }}>red</span>) represent a <em>negative benefit</em>,
                i.e. an <strong>increase in costs</strong> rather than a saving.
                Positive values (shown in <span style={{ color: '#2e7d32', fontWeight: 600 }}>green</span>) represent actual cost savings.
            </Alert>

            {/* NEB Distributions for active measure */}
            {activeData && (
                <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    {renderDistribution(activeData.waste_values || [], `Waste Savings ($) — ${activeMeasure}`, '#ff9800')}
                    {renderDistribution(activeData.production_values || [], `Production Savings ($) — ${activeMeasure}`, '#4caf50')}
                    {renderDistribution(activeData.resource_values || [], `Resource Savings ($) — ${activeMeasure}`, '#9c27b0')}
                </Box>
            )}

            <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Measure</TableCell>
                            <TableCell align="right">Imp. Cost ($)</TableCell>
                            <TableCell align="right">Energy Savings ($)</TableCell>
                            <TableCell align="right">Other Energy ($)</TableCell>
                            <TableCell align="right">Waste ($)</TableCell>
                            <TableCell align="right">Production ($)</TableCell>
                            <TableCell align="right">Resource ($)</TableCell>
                            <TableCell align="center">Op. Cost ($)</TableCell>
                            <TableCell align="center">NEB ($)</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {nebData.map(m => {
                            const isActive = m.arc === activeMeasure;
                            const inputs = nebInputs[m.arc] || { opCost: 0, nebValue: 0 };
                            return (
                                <TableRow
                                    key={m.arc} hover selected={isActive}
                                    onClick={() => setActiveMeasure(m.arc)} sx={{ cursor: 'pointer' }}
                                >
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="bold">{m.arc}</Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 180, display: 'block' }}>
                                            {sanitizeMeasureDescription(m.arc, m.description)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">{fmt(m.imp_cost_median)}</TableCell>
                                    <TableCell align="right">{fmt(m.energy_savings_median)}</TableCell>
                                    <TableCell align="right" sx={{ color: nebColor(m.other_energy_median), fontWeight: m.other_energy_median ? 600 : undefined }}>
                                        {fmt(m.other_energy_median)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: nebColor(m.waste_costs_median), fontWeight: m.waste_costs_median ? 600 : undefined }}>
                                        {fmt(m.waste_costs_median)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: nebColor(m.production_costs_median), fontWeight: m.production_costs_median ? 600 : undefined }}>
                                        {fmt(m.production_costs_median)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: nebColor(m.resource_costs_median), fontWeight: m.resource_costs_median ? 600 : undefined }}>
                                        {fmt(m.resource_costs_median)}
                                    </TableCell>
                                    <TableCell align="center" onClick={e => e.stopPropagation()}>
                                        <TextField
                                            size="small" type="number" value={inputs.opCost}
                                            onChange={e => handleInputChange(m.arc, 'opCost', +e.target.value)}
                                            sx={{ width: 80 }}
                                        />
                                    </TableCell>
                                    <TableCell align="center" onClick={e => e.stopPropagation()}>
                                        <TextField
                                            size="small" type="number" value={inputs.nebValue}
                                            onChange={e => handleInputChange(m.arc, 'nebValue', +e.target.value)}
                                            sx={{ width: 80 }}
                                        />
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default Step8_NEBInput;
