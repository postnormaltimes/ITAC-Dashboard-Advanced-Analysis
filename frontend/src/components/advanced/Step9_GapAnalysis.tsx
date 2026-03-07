import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, CircularProgress } from '@mui/material';
import { api } from '../../api/client';
import type { FirmSizeCategory, PrimaryCurvePoint, EconomicSummary } from '../../types';
import SupplyCurveChart from './SupplyCurveChart';
import type { SupplyCurveItem } from './SupplyCurveChart';

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

    const curveItems: SupplyCurveItem[] = curve.map(pt => ({
        savings: pt.width,
        cce: pt.y,
        label: pt.label,
        id: pt.id,
    }));

    // NEB adjustments summary
    const totalNebAdjustment = Object.values(nebInputs).reduce((sum, inp) => sum + (inp.nebValue || 0) - (inp.opCost || 0), 0);

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 11: Gap Analysis</Typography>
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
                            <Typography variant="caption" color="text.secondary">Measures ≤ Cutoff</Typography>
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
            <SupplyCurveChart
                items={curveItems}
                marketPrice={cutoff}
                title="CCE Supply Curve ($/GJ primary)"
            />

            {/* Measure details */}
            <Paper sx={{ p: 2, mt: 3 }}>
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
