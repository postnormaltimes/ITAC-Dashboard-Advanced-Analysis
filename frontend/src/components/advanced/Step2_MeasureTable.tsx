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
    IconButton
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { AdvancedMeasure, MeasureDistributionResponse } from '../../types';
import { computeStats, computeHistogram, normalizeWeights } from '../../utils/stats';
import { sanitizeMeasureDescription } from '../../utils/text';
import { api } from '../../api/client';

interface Step2Props {
    measures: AdvancedMeasure[];
    industryMedianCost: number;
    naicsCode: string;
    onBack: () => void;
    onNext: () => void;
}

const Step2_MeasureTable: React.FC<Step2Props> = ({ measures, industryMedianCost: _industryMedianCost, naicsCode, onBack, onNext }) => {
    // Current weights: Count, Imp Rate, CCE, Payback, Savings
    const defaultWeights = [30, 25, 20, 15, 10];
    const [weights, setWeights] = useState<number[]>(defaultWeights);
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [editVal, setEditVal] = useState<string>('');
    const [activeMeasure, setActiveMeasure] = useState<string>(measures[0]?.arc || '');
    const [distData, setDistData] = useState<MeasureDistributionResponse | null>(null);

    useEffect(() => {
        if (!activeMeasure || !naicsCode) return;
        let mounted = true;
        api.getMeasureDistributions(naicsCode, activeMeasure)
            .then(d => { if (mounted) setDistData(d); })
            .catch(console.error);
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

    // Calculate score min/max for normalization based on currently filtered measures
    // The backend already scored them, but if user hits 'Edit Weights', we re-calculate locally.
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

    // Compute distribution stats for histograms over the top selected/displayed or all measures?
    // "Identify the dataset in Step 2 used for ranked measures (post-filtering)"
    // Let's use the full incoming dataset for the histogram context since it's ranking them.
    const histSavings = computeHistogram(measures.map(m => m.gross_savings));
    const histPayback = computeHistogram(measures.map(m => m.payback));
    const histCcePrimary = computeHistogram(measures.map(m => m.cce_primary).filter(v => v > 0));

    const statSavings = computeStats(measures.map(m => m.gross_savings));
    const statPayback = computeStats(measures.map(m => m.payback));
    const statCcePrimary = computeStats(measures.map(m => m.cce_primary).filter(v => v > 0));

    // Per-measure distributions from API
    const perMeasureHists = distData ? {
        gs: computeHistogram(distData.gross_savings),
        pb: computeHistogram(distData.payback),
        cce: computeHistogram(distData.cce_primary),
        gsStats: computeStats(distData.gross_savings),
        pbStats: computeStats(distData.payback),
        cceStats: computeStats(distData.cce_primary),
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

    const renderHistogram = (title: string, hist: { bins: any[], excludedCount: number }, stat: any, unit: string) => (
        <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, p: 1.5, '&:last-child': { pb: 1.5 } }}>
                <Typography variant="subtitle2" gutterBottom>{title}</Typography>
                <Box sx={{ height: 100, width: '100%' }}>
                    {hist.bins.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={hist.bins}>
                                <XAxis dataKey="label" hide />
                                <Tooltip cursor={{ fill: '#f5f5f5' }} />
                                <Bar dataKey="count" fill="#4dabf5" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <Typography variant="caption" color="text.secondary">No data available</Typography>
                    )}
                </Box>
                <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" display="block">Median: {stat.median.toFixed(2)} {unit}</Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                        StdDev: {stat.stdev.toFixed(2)} | Q1: {stat.q1.toFixed(1)} | Q3: {stat.q3.toFixed(1)}
                    </Typography>
                    {hist.excludedCount > 0 && (
                        <Typography variant="caption" display="block" color="error.main" sx={{ mt: 0.5 }}>
                            Excluded {hist.excludedCount} invalid records
                        </Typography>
                    )}
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

            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
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
                    <Box sx={{ width: { xs: '100%', md: 'calc(25% - 16px)' } }}>
                        {renderHistogram('Gross Savings', histSavings, statSavings, '$')}
                    </Box>
                    <Box sx={{ width: { xs: '100%', md: 'calc(25% - 16px)' } }}>
                        {renderHistogram('Payback Period', histPayback, statPayback, 'yrs')}
                    </Box>
                    <Box sx={{ width: { xs: '100%', md: 'calc(25% - 16px)' } }}>
                        {renderHistogram('CCE ($/GJ primary)', histCcePrimary, statCcePrimary, '$/GJ')}
                    </Box>
                </Box>
                {/* Per-measure distributions */}
                {activeMeasure && perMeasureHists && (
                    <Box sx={{ display: 'flex', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                        <Box sx={{ flex: '1 1 250px' }}>
                            {renderHistogram(`Gross Savings — ${activeMeasure}`, perMeasureHists.gs, perMeasureHists.gsStats, '$')}
                        </Box>
                        <Box sx={{ flex: '1 1 250px' }}>
                            {renderHistogram(`Payback — ${activeMeasure}`, perMeasureHists.pb, perMeasureHists.pbStats, 'yrs')}
                        </Box>
                        <Box sx={{ flex: '1 1 250px' }}>
                            {renderHistogram(`CCE ($/GJ) — ${activeMeasure}`, perMeasureHists.cce, perMeasureHists.cceStats, '$/GJ')}
                        </Box>
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
