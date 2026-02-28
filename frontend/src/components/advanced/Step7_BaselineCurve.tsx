import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, TextField, CircularProgress } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, Label } from 'recharts';
import { api } from '../../api/client';
import type { FirmSizeCategory, PrimaryCurvePoint, EconomicSummary } from '../../types';
import { buildSupplyCurveSteps } from '../../utils/stats';

interface Step7Props {
    naicsCode: string;
    selectedMeasureIds: string[];
    selectedCategories: FirmSizeCategory[];
    onBack: () => void;
    onNext: () => void;
}

const Step7_BaselineCurve: React.FC<Step7Props> = ({ naicsCode, selectedMeasureIds, selectedCategories, onBack, onNext }) => {
    const [elecPrice, setElecPrice] = useState(70.0);
    const [gasPrice, setGasPrice] = useState(5.0);
    const [loading, setLoading] = useState(false);
    const [curve, setCurve] = useState<PrimaryCurvePoint[]>([]);
    const [cutoff, setCutoff] = useState(0);
    const [summary, setSummary] = useState<EconomicSummary | null>(null);

    const loadCurve = async () => {
        setLoading(true);
        try {
            const data = await api.getPrimaryCurves(naicsCode, selectedMeasureIds, elecPrice, gasPrice, selectedCategories);
            setCurve(data.primary_curve);
            setCutoff(data.cutoff_price_gj_primary);
            setSummary(data.economic_summary);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadCurve(); }, [naicsCode, selectedMeasureIds, selectedCategories]);

    // Build staircase data for Recharts
    const steps = buildSupplyCurveSteps(
        curve.map(pt => ({ savings: pt.width, cce: pt.y, label: pt.label, units: 'GJ_primary' }))
    );

    const maxX = steps.length ? Math.max(...steps.map(s => s.x)) : 1;
    const maxY = steps.length ? Math.max(...steps.map(s => s.y), cutoff * 1.2) : 1;

    // Find the x where cce exceeds cutoff (for area shading)
    let econBoundaryX = maxX;
    for (const pt of curve) {
        if (pt.y > cutoff) {
            econBoundaryX = pt.x;
            break;
        }
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 7: Baseline Potential (Primary Energy)</Typography>
                    <Typography color="text.secondary">
                        Combined cost of conserved energy supply curve in $/GJ_primary.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="contained" onClick={onNext}>Next: NEB</Button>
                </Box>
            </Box>

            {/* Price Inputs */}
            <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                    label="Electricity Price ($/MWh)" type="number" size="small"
                    value={elecPrice} onChange={e => setElecPrice(+e.target.value)}
                    sx={{ width: 200 }}
                />
                <TextField
                    label="Gas Price ($/MMBtu)" type="number" size="small"
                    value={gasPrice} onChange={e => setGasPrice(+e.target.value)}
                    sx={{ width: 200 }}
                />
                <Button variant="outlined" onClick={loadCurve}>Update Curve</Button>
                {cutoff > 0 && (
                    <Typography variant="body2" color="text.secondary">
                        Cutoff: <strong>${cutoff.toFixed(2)}/GJ_primary</strong>
                    </Typography>
                )}
            </Paper>

            {loading ? (
                <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>
            ) : (
                <>
                    <Paper sx={{ p: 2, mb: 3 }}>
                        <ResponsiveContainer width="100%" height={400}>
                            <BarChart data={steps} barCategoryGap={0} barGap={0}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="x" type="number" domain={[0, maxX * 1.05]}
                                    label={{ value: 'Cumulative Primary Energy Saved (GJ)', position: 'insideBottom', offset: -5 }}
                                    tick={{ fontSize: 10 }}
                                />
                                <YAxis
                                    domain={[0, maxY * 1.1]}
                                    label={{ value: '$/GJ primary', angle: -90, position: 'insideLeft' }}
                                    tick={{ fontSize: 10 }}
                                />
                                <Tooltip
                                    formatter={(value: number | string) => [`$${Number(value).toFixed(2)}/GJ`, 'CCE']}
                                    labelFormatter={(val) => `@ ${Number(val).toFixed(0)} GJ`}
                                />
                                <ReferenceLine y={cutoff} stroke="#f44336" strokeDasharray="5 5">
                                    <Label value={`Cutoff: $${cutoff.toFixed(2)}/GJ`} position="right" fill="#f44336" />
                                </ReferenceLine>
                                {/* Economic region (green) */}
                                <ReferenceArea x1={0} x2={econBoundaryX} y1={0} y2={cutoff} fill="#4caf50" fillOpacity={0.08} />
                                {/* Non-economic region (red) */}
                                <ReferenceArea x1={econBoundaryX} x2={maxX} y1={cutoff} y2={maxY * 1.1} fill="#f44336" fillOpacity={0.05} />
                                <Bar dataKey="y" fill="#1976d2" isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Paper>

                    {/* Economic Potential Summary */}
                    {summary && (
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>Economic Potential Summary</Typography>
                            <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Technical Potential</Typography>
                                    <Typography variant="h6">{summary.total_technical_gj.toFixed(0)} GJ</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Economic Potential</Typography>
                                    <Typography variant="h6" color="success.main">{summary.economic_gj.toFixed(0)} GJ</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Share Economic</Typography>
                                    <Typography variant="h6">{(summary.share_economic * 100).toFixed(1)}%</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Measures Below Cutoff</Typography>
                                    <Typography variant="h6">{summary.count_economic} / {summary.count_total}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Weighted Cutoff</Typography>
                                    <Typography variant="h6">${summary.cutoff_price.toFixed(2)} /GJ</Typography>
                                </Box>
                            </Box>
                        </Paper>
                    )}
                </>
            )}
        </Box>
    );
};

export default Step7_BaselineCurve;
