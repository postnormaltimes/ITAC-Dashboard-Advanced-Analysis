import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Button,
    Card,
    CardContent,
    TextField,
    IconButton,
    CircularProgress
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { AdvancedMeasure, MeasureDistributionResponse } from '../../types';
import { computeStats, computeHistogram, normalizeWeights } from '../../utils/stats';
import { sanitizeMeasureDescription } from '../../utils/text';
import { api } from '../../api/client';
import { resolveNaicsScopeForMeasureCCE } from '../../utils/naicsFallback';

// Colors shared with Step 5 for cognitive continuity
const CHART_COLORS = {
    grossSavings: '#4caf50',
    payback: '#ff9800',
    ccePrimary: '#2196f3',
};

interface Step2Props {
    measures: AdvancedMeasure[];
    industryMedianCost: number;
    naicsCode: string;
    onBack: () => void;
    onNext: () => void;
}

const Step2_MeasureTable: React.FC<Step2Props> = ({ measures, industryMedianCost: _industryMedianCost, naicsCode, onBack, onNext }) => {
    const defaultWeights = [30, 25, 20, 15, 10];
    const [weights, setWeights] = useState<number[]>(defaultWeights);
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [editVal, setEditVal] = useState<string>('');
    const [activeMeasure, setActiveMeasure] = useState<string>(measures[0]?.arc || '');
    const [distData, setDistData] = useState<MeasureDistributionResponse | null>(null);
    const [cceFallbackData, setCceFallbackData] = useState<{ dists: MeasureDistributionResponse, prefix: string | null } | null>(null);
    const [isLoadingDists, setIsLoadingDists] = useState(false);

    useEffect(() => {
        if (!activeMeasure || !naicsCode) return;
        let mounted = true;
        setIsLoadingDists(true);

        const loadDistributions = async () => {
            try {
                // 1. Fetch exact distributions for Gross Savings and Payback
                const exactDists = await api.getMeasureDistributions(naicsCode, activeMeasure);

                // 2. Resolve fallback distributions specifically for CCE
                const cceResolved = await resolveNaicsScopeForMeasureCCE({
                    selectedNaics: naicsCode,
                    arcCode: activeMeasure,
                });

                if (mounted) {
                    setDistData(exactDists);
                    setCceFallbackData(cceResolved.distributions ? {
                        dists: cceResolved.distributions,
                        prefix: cceResolved.scope === 'exact' ? null : cceResolved.usedNaicsPrefix,
                    } : null);
                }
            } catch (err) {
                console.error("Failed to load measure distributions", err);
            } finally {
                if (mounted) setIsLoadingDists(false);
            }
        };

        loadDistributions();

        return () => { mounted = false; };
    }, [activeMeasure, naicsCode]);

    const handleEditWeight = (index: number) => {
        setEditIdx(index);
        setEditVal(weights[index].toString());
    };

    const handleSaveWeight = () => {
        if (editIdx !== null) {
            const val = parseFloat(editVal) || 0;
            const newW = [...weights];
            newW[editIdx] = val;
            setWeights(normalizeWeights(newW, editIdx));
            setEditIdx(null);
        }
    };

    const _getMinMax = (key: keyof AdvancedMeasure) => {
        let min = Infinity;
        let max = -Infinity;
        measures.forEach(m => {
            const val = m[key] as number;
            if (val !== undefined && val !== null) {
                if (val < min) min = val;
                if (val > max) max = val;
            }
        });
        if (min === Infinity || max === -Infinity) return { min: 0, max: 0 };
        return { min, max };
    };

    const normMaxBetter = (val: number, min: number, max: number) => {
        if (max === min) return 1.0;
        return (val - min) / (max - min);
    };

    const normMinBetter = (val: number, min: number, max: number) => {
        if (max === min) return 1.0;
        return (max - val) / (max - min);
    };

    const countStats = _getMinMax('count');
    const impStats = _getMinMax('imp_rate');
    const cceStats = _getMinMax('cce_primary');
    const paybackStats = _getMinMax('payback');
    const savingsStats = _getMinMax('gross_savings');

    const recalculatedMeasures = measures.map(m => {
        const normCount = normMaxBetter(m.count, countStats.min, countStats.max);
        const normImp = normMaxBetter(m.imp_rate, impStats.min, impStats.max);
        const normCce = normMinBetter(m.cce_primary, cceStats.min, cceStats.max);
        const normPayback = normMinBetter(m.payback, paybackStats.min, paybackStats.max);
        const normSavings = normMaxBetter(m.gross_savings, savingsStats.min, savingsStats.max);

        const newScore = 100 * (
            normCount * (weights[0] / 100) +
            normImp * (weights[1] / 100) +
            normCce * (weights[2] / 100) +
            normPayback * (weights[3] / 100) +
            normSavings * (weights[4] / 100)
        );

        return { ...m, score: newScore };
    }).sort((a, b) => b.score - a.score);

    const displayMeasures = recalculatedMeasures.slice(0, 50);

    // Per-measure distributions from API (GS and PB use exact data, CCE uses fallback data)
    const perMeasureHists = (distData && cceFallbackData?.dists) ? {
        gs: computeHistogram(distData.gross_savings),
        pb: computeHistogram(distData.payback),
        cce: computeHistogram(cceFallbackData.dists.cce_primary),
        gsStats: computeStats(distData.gross_savings),
        pbStats: computeStats(distData.payback),
        cceStats: computeStats(cceFallbackData.dists.cce_primary),
        ccePrefix: cceFallbackData.prefix
    } : null;

    const renderWeightControl = (title: string, wIndex: number) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>{title}</Typography>
            {editIdx === wIndex ? (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <TextField
                        size="small"
                        type="number"
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        sx={{ width: 60, mr: 1 }}
                        inputProps={{ min: 0, max: 100 }}
                    />
                    <IconButton size="small" color="primary" onClick={handleSaveWeight}><SaveIcon fontSize="small" /></IconButton>
                </Box>
            ) : (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography variant="body2" color="primary" sx={{ mr: 1 }}>{weights[wIndex]}%</Typography>
                    <IconButton size="small" onClick={() => handleEditWeight(wIndex)}><EditIcon fontSize="small" /></IconButton>
                </Box>
            )}
        </Box>
    );

    const renderHistogram = (title: string, hist: { bins: { label: string; count: number }[], excludedCount: number }, stat: { median: number; stdev: number; q1: number; q3: number }, unit: string, color: string) => (
        <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="subtitle2" gutterBottom>{title}</Typography>
                <Box sx={{ height: 120, width: '100%' }}>
                    {hist.bins.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hist.bins}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" tick={{ fontSize: 8 }} interval="preserveStartEnd" />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip cursor={{ fill: '#f5f5f5' }} />
                                <Bar dataKey="count" fill={color} radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <Typography variant="caption" color="text.secondary">No data available</Typography>
                    )}
                </Box>
                <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" display="block">Median: {stat.median.toFixed(2)} {unit}</Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                        σ: {stat.stdev.toFixed(2)} | Q1: {stat.q1.toFixed(1)} | Q3: {stat.q3.toFixed(1)}
                    </Typography>
                </Box>
            </CardContent>
        </Card>
    );

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 2: Ranked Evaluation</Typography>
                    <Typography color="text.secondary">
                        {measures.length} measures ranked by weighted criteria. Click a row for per-measure distributions.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="contained" onClick={onNext}>Next: Distributions</Button>
                </Box>
            </Box>

            {/* Weights + Per-measure distributions only (no legacy general histograms) */}
            <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                <Box sx={{ width: { xs: '100%', md: 'calc(25% - 16px)' } }}>
                    <Card variant="outlined" sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                                Scoring Weights (sum=100%)
                            </Typography>
                            {renderWeightControl('Freq / Count', 0)}
                            {renderWeightControl('Implementation Rate', 1)}
                            {renderWeightControl('Cost of Conserved Energy', 2)}
                            {renderWeightControl('Payback Period', 3)}
                            {renderWeightControl('Gross Savings ($)', 4)}
                        </CardContent>
                    </Card>
                </Box>
                {perMeasureHists ? (
                    <>
                        <Box sx={{ width: { xs: '100%', md: 'calc(25% - 16px)' } }}>
                            {renderHistogram(`Gross Savings — ${activeMeasure}`, perMeasureHists.gs, perMeasureHists.gsStats, '$', CHART_COLORS.grossSavings)}
                        </Box>
                        <Box sx={{ width: { xs: '100%', md: 'calc(25% - 16px)' } }}>
                            {renderHistogram(`Payback — ${activeMeasure}`, perMeasureHists.pb, perMeasureHists.pbStats, 'yrs', CHART_COLORS.payback)}
                        </Box>
                        <Box sx={{ width: { xs: '100%', md: 'calc(25% - 16px)' } }}>
                            {renderHistogram(
                                `CCE ($/GJ) — ${activeMeasure}${perMeasureHists.ccePrefix !== null ? ` (fallback: NAICS ${perMeasureHists.ccePrefix || 'All'})` : ''}`,
                                perMeasureHists.cce,
                                perMeasureHists.cceStats,
                                '$/GJ',
                                CHART_COLORS.ccePrimary
                            )}
                        </Box>
                    </>
                ) : (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {isLoadingDists ? (
                            <CircularProgress size={24} />
                        ) : (
                            <Typography color="text.secondary">Select a measure to view distributions</Typography>
                        )}
                    </Box>
                )}
            </Box>

            <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Rank</TableCell>
                            <TableCell>ARC Code</TableCell>
                            <TableCell align="right">Count</TableCell>
                            <TableCell align="right">Imp Rate</TableCell>
                            <TableCell align="right">Gross Savings (Median)</TableCell>
                            <TableCell align="right">Payback (Median)</TableCell>
                            <TableCell align="right">CCE ($/GJ primary)</TableCell>
                            <TableCell align="right">Score (0-100)</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {displayMeasures.map((row, index) => (
                            <TableRow key={row.arc} hover selected={row.arc === activeMeasure}
                                onClick={() => setActiveMeasure(row.arc)} sx={{ cursor: 'pointer' }}>
                                <TableCell>{index + 1}</TableCell>
                                <TableCell>
                                    <Box>
                                        <Typography variant="body2" fontWeight="bold">{row.arc}</Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200, display: 'block' }}>
                                            {sanitizeMeasureDescription(row.arc, row.description)}
                                        </Typography>
                                    </Box>
                                </TableCell>
                                <TableCell align="right">{row.count}</TableCell>
                                <TableCell align="right">{(row.imp_rate * 100).toFixed(1)}%</TableCell>
                                <TableCell align="right">{row.gross_savings.toLocaleString()}</TableCell>
                                <TableCell align="right">{row.payback.toFixed(2)} yrs</TableCell>
                                <TableCell align="right">${row.cce_primary.toFixed(2)}/GJ</TableCell>
                                <TableCell align="right">
                                    <Chip
                                        label={row.score.toFixed(1)}
                                        color={row.score > 80 ? "success" : row.score > 50 ? "warning" : "default"}
                                        size="small"
                                    />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Showing top 50 / {measures.length} measures. Sorted by Total Score.
            </Typography>
        </Box>
    );
};

export default Step2_MeasureTable;
