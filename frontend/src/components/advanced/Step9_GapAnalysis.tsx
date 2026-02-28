import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, CircularProgress } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, ReferenceArea, Label } from 'recharts';
import { api } from '../../api/client';
import type { FirmSizeCategory, PrimaryCurvePoint, EconomicSummary } from '../../types';
import { buildSupplyCurveSteps } from '../../utils/stats';

interface Step9Props {
    naicsCode: string;
    selectedMeasureIds: string[];
    selectedCategories: FirmSizeCategory[];
    nebInputs: Record<string, { opCost: number, nebValue: number }>;
    onBack: () => void;
    onReset: () => void;
}

const Step9_GapAnalysis: React.FC<Step9Props> = ({ naicsCode, selectedMeasureIds, selectedCategories, nebInputs, onBack, onReset }) => {
    const [loading, setLoading] = useState(true);
    const [curve, setCurve] = useState<PrimaryCurvePoint[]>([]);
    const [cutoff, setCutoff] = useState(0);
    const [summary, setSummary] = useState<EconomicSummary | null>(null);

    useEffect(() => {
        let mounted = true;
        api.getPrimaryCurves(naicsCode, selectedMeasureIds, 70, 5, selectedCategories)
            .then(data => {
                if (mounted) {
                    setCurve(data.primary_curve);
                    setCutoff(data.cutoff_price_gj_primary);
                    setSummary(data.economic_summary);
                }
            })
            .catch(console.error)
            .finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, [naicsCode, selectedMeasureIds, selectedCategories]);

    const steps = buildSupplyCurveSteps(
        curve.map(pt => ({ savings: pt.width, cce: pt.y, label: pt.label, units: 'GJ_primary' }))
    );
    const maxX = steps.length ? Math.max(...steps.map(s => s.x)) : 1;
    const maxY = steps.length ? Math.max(...steps.map(s => s.y), cutoff * 1.2) : 1;

    let econBoundaryX = maxX;
    for (const pt of curve) {
        if (pt.y > cutoff) { econBoundaryX = pt.x; break; }
    }

    // Apply NEB adjustments summary
    const totalNebAdjustment = Object.values(nebInputs).reduce((sum, inp) => sum + (inp.nebValue || 0) - (inp.opCost || 0), 0);

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 9: Gap Analysis</Typography>
                    <Typography color="text.secondary">
                        Final assessment with NEB adjustments. Economic vs technical potential.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="outlined" onClick={onReset}>Reset Analysis</Button>
                </Box>
            </Box>

            {/* Economic Potential Summary */}
            {summary && (
                <Paper sx={{ p: 2, mb: 3 }}>
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
                            <Typography variant="caption" color="text.secondary">NEB Net Adjustment</Typography>
                            <Typography variant="h6" color={totalNebAdjustment >= 0 ? 'success.main' : 'error.main'}>
                                ${totalNebAdjustment.toLocaleString()}/yr
                            </Typography>
                        </Box>
                    </Box>
                </Paper>
            )}

            {/* Supply Curve */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>CCE Supply Curve ($/GJ primary)</Typography>
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
                        <Tooltip />
                        <ReferenceLine y={cutoff} stroke="#f44336" strokeDasharray="5 5">
                            <Label value={`Cutoff: $${cutoff.toFixed(2)}/GJ`} position="right" fill="#f44336" />
                        </ReferenceLine>
                        <ReferenceArea x1={0} x2={econBoundaryX} y1={0} y2={cutoff} fill="#4caf50" fillOpacity={0.08} />
                        <ReferenceArea x1={econBoundaryX} x2={maxX} y1={cutoff} y2={maxY * 1.1} fill="#f44336" fillOpacity={0.05} />
                        <Bar dataKey="y" fill="#1976d2" isAnimationActive={false} />
                    </BarChart>
                </ResponsiveContainer>
            </Paper>

            {/* Measure details table (simple summary) */}
            <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>Selected Measures ({selectedMeasureIds.length})</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {curve.map(pt => (
                        <Paper key={pt.id} variant="outlined" sx={{
                            p: 1, minWidth: 120,
                            borderColor: pt.y <= cutoff ? 'success.main' : 'error.main',
                            borderWidth: 2,
                        }}>
                            <Typography variant="caption" fontWeight="bold">{pt.id}</Typography>
                            <Typography variant="caption" display="block" color="text.secondary">{pt.label}</Typography>
                            <Typography variant="body2">${pt.y.toFixed(2)}/GJ</Typography>
                            <Typography variant="caption" color="text.secondary">{pt.width.toFixed(1)} GJ</Typography>
                        </Paper>
                    ))}
                </Box>
            </Paper>
        </Box>
    );
};

export default Step9_GapAnalysis;
