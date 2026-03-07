import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../../api/client';
import type { AdvancedMeasure, FirmSizeCategory, MeasureDistributionResponse } from '../../types';
import { sanitizeMeasureDescription } from '../../utils/text';
import { computeStats, computeHistogram } from '../../utils/stats';

interface Step5Props {
    naicsCode: string;
    genericMeasures: AdvancedMeasure[];
    selectedCategories: FirmSizeCategory[];
    onBack: () => void;
    onNext: (clusterMeasures: AdvancedMeasure[]) => void;
}

const Step5_Comparison: React.FC<Step5Props> = ({ naicsCode, genericMeasures, selectedCategories, onBack, onNext }) => {
    const [loading, setLoading] = useState(true);
    const [clusterData, setClusterData] = useState<{ cluster_metrics: AdvancedMeasure[], cluster_size: number } | null>(null);
    const [activeMeasure, setActiveMeasure] = useState<string>('');
    const [distData, setDistData] = useState<MeasureDistributionResponse | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const data = await api.getAdvancedStep3(
                    naicsCode, 0, 1e9, 0, 1e15, selectedCategories
                );
                if (mounted) {
                    setClusterData(data);
                    if (data.cluster_metrics.length > 0) {
                        setActiveMeasure(data.cluster_metrics[0].arc);
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [naicsCode, selectedCategories]);

    // Fetch per-measure distributions when active measure changes
    useEffect(() => {
        if (!activeMeasure) return;
        let mounted = true;
        api.getMeasureDistributions(naicsCode, activeMeasure, selectedCategories)
            .then(d => { if (mounted) setDistData(d); })
            .catch(console.error);
        return () => { mounted = false; };
    }, [activeMeasure, naicsCode, selectedCategories]);

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
    if (!clusterData) return <Box sx={{ p: 4, textAlign: 'center' }}>Failed to load comparison.</Box>;

    const genericMap = new Map(genericMeasures.map(m => [m.arc, m]));
    const rows = clusterData.cluster_metrics.slice(0, 50).map(cm => {
        const gm = genericMap.get(cm.arc);
        return { arc: cm.arc, desc: sanitizeMeasureDescription(cm.arc, cm.description), cluster: cm, generic: gm };
    });

    const renderHistogram = (values: number[], title: string, color: string) => {
        if (!values.length) return <Typography variant="caption" color="text.secondary">No data</Typography>;
        const hist = computeHistogram(values);
        const stats = computeStats(values);
        return (
            <Paper sx={{ p: 2, flex: '1 1 280px' }}>
                <Typography variant="subtitle2" gutterBottom>{title}</Typography>
                <ResponsiveContainer width="100%" height={150}>
                    <BarChart data={hist.bins}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill={color} />
                    </BarChart>
                </ResponsiveContainer>
                <Typography variant="caption" color="text.secondary">
                    Median: {stats.median.toFixed(2)} | Q1: {stats.q1.toFixed(2)} | Q3: {stats.q3.toFixed(2)} | σ: {stats.stdev.toFixed(2)}
                </Typography>
            </Paper>
        );
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 5: Cluster Comparison</Typography>
                    <Typography color="text.secondary">
                        Comparing {clusterData.cluster_size} firms in cluster ({selectedCategories.join(', ')}) vs Industry Baseline.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="contained" onClick={() => onNext(clusterData.cluster_metrics)}>Next: Selection</Button>
                </Box>
            </Box>

            {/* Per-measure distributions */}
            {distData && (
                <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                    {renderHistogram(distData.gross_savings, `Gross Savings ($) — ${activeMeasure}`, '#4caf50')}
                    {renderHistogram(distData.payback, `Payback (Years) — ${activeMeasure}`, '#ff9800')}
                    {renderHistogram(distData.cce_primary, `CCE ($/GJ primary) — ${activeMeasure}`, '#2196f3')}
                </Box>
            )}

            <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Measure</TableCell>
                            <TableCell align="center" colSpan={3} sx={{ borderLeft: '1px solid #eee' }}>Score</TableCell>
                            <TableCell align="center" colSpan={3} sx={{ borderLeft: '1px solid #eee' }}>Payback (Yrs)</TableCell>
                            <TableCell align="center" colSpan={3} sx={{ borderLeft: '1px solid #eee' }}>CCE ($/GJ)</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell>ARC Code</TableCell>
                            <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>Generic</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Cluster</TableCell>
                            <TableCell align="right">Diff</TableCell>
                            <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>Generic</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Cluster</TableCell>
                            <TableCell align="right">Diff</TableCell>
                            <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>Generic</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Cluster</TableCell>
                            <TableCell align="right">Diff</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => {
                            const scoreDiff = row.cluster.score - (row.generic?.score || 0);
                            const paybackDiff = (row.cluster.payback ?? 0) - (row.generic?.payback ?? 0);
                            const cceDiff = (row.cluster.cce_primary ?? 0) - (row.generic?.cce_primary ?? 0);
                            const isActive = row.arc === activeMeasure;
                            return (
                                <TableRow
                                    key={row.arc} hover selected={isActive}
                                    onClick={() => setActiveMeasure(row.arc)}
                                    sx={{ cursor: 'pointer' }}
                                >
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="bold">{row.arc}</Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200, display: 'block' }}>
                                            {row.desc}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>
                                        {row.generic?.score.toFixed(1) || '-'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{row.cluster.score.toFixed(1)}</TableCell>
                                    <TableCell align="right" sx={{ color: scoreDiff > 0 ? 'success.main' : 'error.main' }}>
                                        {scoreDiff > 0 ? '+' : ''}{scoreDiff.toFixed(1)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>
                                        {row.generic?.payback != null ? row.generic.payback.toFixed(1) : '-'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{row.cluster.payback != null ? row.cluster.payback.toFixed(1) : '-'}</TableCell>
                                    <TableCell align="right" sx={{ color: paybackDiff < 0 ? 'success.main' : 'error.main' }}>
                                        {paybackDiff > 0 ? '+' : ''}{paybackDiff.toFixed(1)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>
                                        {row.generic?.cce_primary != null ? row.generic.cce_primary.toFixed(2) : '-'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>{row.cluster.cce_primary != null ? row.cluster.cce_primary.toFixed(2) : '-'}</TableCell>
                                    <TableCell align="right" sx={{ color: cceDiff < 0 ? 'success.main' : 'error.main' }}>
                                        {cceDiff > 0 ? '+' : ''}{cceDiff.toFixed(2)}
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

export default Step5_Comparison;
