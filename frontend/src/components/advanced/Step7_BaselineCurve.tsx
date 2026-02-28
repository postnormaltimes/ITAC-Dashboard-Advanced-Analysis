import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, TextField, CircularProgress } from '@mui/material';
import { api } from '../../api/client';
import type { FirmSizeCategory, PrimaryCurvePoint, EconomicSummary } from '../../types';
import SupplyCurveChart from './SupplyCurveChart';
import type { SupplyCurveItem } from './SupplyCurveChart';

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

    // Convert API curve to SupplyCurveItem format
    const curveItems: SupplyCurveItem[] = curve.map(pt => ({
        savings: pt.width,
        cce: pt.y,
        label: pt.label,
        id: pt.id,
    }));

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
                        Weighted Cutoff: <strong>${cutoff.toFixed(2)}/GJ_primary</strong>
                    </Typography>
                )}
            </Paper>

            {loading ? (
                <Box sx={{ textAlign: 'center', p: 4 }}><CircularProgress /></Box>
            ) : (
                <>
                    <SupplyCurveChart
                        items={curveItems}
                        marketPrice={cutoff}
                        title="Cost of Conserved Energy Supply Curve"
                    />

                    {/* Economic Potential Summary */}
                    {summary && (
                        <Paper sx={{ p: 2, mt: 3 }}>
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
                            </Box>
                        </Paper>
                    )}
                </>
            )}
        </Box>
    );
};

export default Step7_BaselineCurve;
