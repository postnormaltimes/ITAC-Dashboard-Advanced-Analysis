import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, CircularProgress, ToggleButton, ToggleButtonGroup } from '@mui/material';
import {
    ComposedChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Scatter
} from 'recharts';
import { api } from '../../api/client';
import type { AdvancedStep4Response, CurvePoint } from '../../types';
import { buildSupplyCurveSteps } from '../../utils/stats';

interface Step9Props {
    naicsCode: string;
    selectedMeasureIds: string[]; // These define the scope
    nebInputs: Record<string, { opCost: number, nebValue: number }>;
    onBack: () => void;
    onReset: () => void;
}

const Step9_GapAnalysis: React.FC<Step9Props> = ({ naicsCode, selectedMeasureIds, nebInputs, onBack, onReset }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AdvancedStep4Response | null>(null);
    const [adjustedData, setAdjustedData] = useState<CurvePoint[]>([]);
    const [resourceType, setResourceType] = useState<'electricity' | 'natural_gas'>('electricity');

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const res = await api.getAdvancedStep4(naicsCode, selectedMeasureIds, resourceType);
                if (!mounted) return;

                setData(res);
                const baseline = res.baseline_curve;

                // Calculate Adjusted
                // Adjusted Y (CCE) = Y + (OpCost - NEB) / Savings
                const adjusted = baseline.map(pt => {
                    const inputs = nebInputs[pt.id] || { opCost: 0, nebValue: 0 };
                    const deltaCost = inputs.opCost - inputs.nebValue;
                    // Avoid division by zero, though width (savings) should be > 0
                    const width = pt.width || 1;
                    const adjustedY = pt.y + (deltaCost / width);
                    return {
                        ...pt,
                        y: adjustedY,
                        // Note: X coordinates (cumulative) stay the same because savings quantity doesn't change, 
                        // only the cost effectiveness (order might change if we re-sorted, but for comparison usually nice to keep order or re-sort?)
                        // If we re-sort, the shape changes completely. 
                        // Truth: Supply curves should strictly be sorted by Y. 
                        // If we adjust Y, we MUST RE-SORT to be a valid supply curve.
                    };
                });

                // Re-sort adjusted curve by new Y
                adjusted.sort((a, b) => a.y - b.y);

                // Re-calculate X (cumulative)
                let cumX = 0;
                const finalAdjusted = adjusted.map(pt => {
                    cumX += pt.width;
                    return { ...pt, x: cumX };
                });

                setAdjustedData(finalAdjusted);

            } catch (err) {
                console.error(err);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [naicsCode, selectedMeasureIds, nebInputs, resourceType]);

    const handleResourceChange = (
        _event: React.MouseEvent<HTMLElement>,
        newResource: 'electricity' | 'natural_gas'
    ) => {
        if (newResource !== null) {
            setResourceType(newResource);
        }
    };

    const isElectricity = resourceType === 'electricity';
    const xAxisLabel = isElectricity ? 'Cumulative Energy Savings (MWh)' : 'Cumulative Energy Savings (MMBtu)';
    const yAxisLabel = isElectricity ? 'Cost of Conserved Energy ($/MWh)' : 'Cost of Conserved Energy ($/MMBtu)';

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;

    const color = '#2ecc71'; // Green for adjusted curve

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 9: Gap Analysis</Typography>
                    <Typography color="text.secondary">
                        Visualize how Non-Energy Benefits shift the supply curve and unlock new potential.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <ToggleButtonGroup
                        value={resourceType}
                        exclusive
                        onChange={handleResourceChange}
                        size="small"
                        color="primary"
                    >
                        <ToggleButton value="electricity">Electricity</ToggleButton>
                        <ToggleButton value="natural_gas">Natural Gas</ToggleButton>
                    </ToggleButtonGroup>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="outlined" color="error" onClick={onReset}>Start Over</Button>
                </Box>
            </Box>

            {!data || data.baseline_curve.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>No data available for {isElectricity ? 'Electricity' : 'Natural Gas'}.</Box>
            ) : (
                (() => {
                    const baselineStaircase = buildSupplyCurveSteps(
                        data.baseline_curve.map((pt: any) => ({
                            savings: pt.width,
                            cce: pt.y,
                            label: pt.label,
                            units: pt.units
                        }))
                    );

                    const adjustedStaircase = buildSupplyCurveSteps(
                        adjustedData.map((pt: any) => ({
                            savings: pt.width,
                            cce: pt.y,
                            label: pt.label,
                            units: pt.units
                        }))
                    );

                    return (
                        <>
                            <Paper sx={{ p: 2, height: 500 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="x"
                                            type="number"
                                            label={{ value: xAxisLabel, position: 'insideBottom', offset: -10 }}
                                            domain={[0, 'auto']}
                                        />
                                        <YAxis
                                            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }}
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const pt = payload[0].payload;
                                                    if (pt.isEdge) return null;
                                                    return (
                                                        <Paper sx={{ p: 1 }}>
                                                            <Typography variant="subtitle2">{pt.label}</Typography>
                                                            <Typography variant="body2">CCE: ${pt.y.toFixed(2)}</Typography>
                                                            <Typography variant="body2">Savings: {pt.width?.toFixed(1) || 0} {pt.units}</Typography>
                                                            <Typography variant="body2">Cum Savings: {(pt.x + (pt.width || 0)).toFixed(1)} {pt.units}</Typography>
                                                        </Paper>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Legend />
                                        {/* Baseline Curve */}
                                        <Scatter
                                            name={`Baseline (${isElectricity ? 'Elec' : 'Gas'})`}
                                            data={baselineStaircase}
                                            dataKey="y"
                                            fill="#95a5a6"
                                            line={{ stroke: '#95a5a6', strokeWidth: 2, strokeDasharray: '5 5' }}
                                            shape="circle"
                                        />
                                        {/* Adjusted Curve */}
                                        <Scatter
                                            name={`NEB Adjusted (${isElectricity ? 'Elec' : 'Gas'})`}
                                            data={adjustedStaircase}
                                            dataKey="y"
                                            fill={color}
                                            line={{ stroke: color, strokeWidth: 3 }}
                                            shape="circle"
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </Paper>
                            <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                                * Solid line: Adjusted. Dashed line: Baseline.
                            </Typography>

                            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
                                <Paper sx={{ p: 2, flex: 1, bgcolor: '#f5f5f5' }}>
                                    <Typography variant="h6">Baseline Potential ({isElectricity ? 'Electricity' : 'Gas'})</Typography>
                                    <Typography variant="body2">Measures: {data.baseline_curve.length}</Typography>
                                </Paper>
                                <Paper sx={{ p: 2, flex: 1, bgcolor: '#e8f5e9' }}>
                                    <Typography variant="h6">Adjusted Potential</Typography>
                                    <Typography variant="body2">Measures: {adjustedData.length}</Typography>
                                    <Typography variant="body2" color="success.main">
                                        Curve shifts down/right indicate better economics.
                                    </Typography>
                                </Paper>
                            </Box>
                        </>
                    );
                })()
            )}
        </Box>
    );
};

export default Step9_GapAnalysis;
