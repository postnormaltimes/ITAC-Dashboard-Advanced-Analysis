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
import type { AdvancedStep4Response } from '../../types';
import { buildSupplyCurveSteps } from '../../utils/stats';

interface Step7Props {
    naicsCode: string;
    selectedMeasureIds: string[];
    onBack: () => void;
    onNext: () => void;
}

const Step7_BaselineCurve: React.FC<Step7Props> = ({ naicsCode, selectedMeasureIds, onBack, onNext }) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<AdvancedStep4Response | null>(null);
    const [resourceType, setResourceType] = useState<'electricity' | 'natural_gas'>('electricity');

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            try {
                const res = await api.getAdvancedStep4(naicsCode, selectedMeasureIds, resourceType);
                if (mounted) setData(res);
            } catch (err) {
                console.error(err);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [naicsCode, selectedMeasureIds, resourceType]);

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
    const color = isElectricity ? '#3498db' : '#e67e22'; // Blue for elec, orange for gas

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 7: Baseline Technical Potential</Typography>
                    <Typography color="text.secondary">
                        Supply Curve of Conserved Energy (CCE). Ordered by cost effectiveness.
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
                    <Button variant="contained" onClick={onNext}>Next: NEB Inputs</Button>
                </Box>
            </Box>

            {loading ? (
                <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
            ) : (!data || data.baseline_curve.length === 0) ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>No data for {isElectricity ? 'Electricity' : 'Natural Gas'} curve.</Box>
            ) : (
                (() => {
                    const staircaseData = buildSupplyCurveSteps(
                        data.baseline_curve.map(pt => ({
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
                                    <ComposedChart data={staircaseData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
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
                                                    if (pt.isEdge) return null; // Avoid double tooltips on vertical drops
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
                                        <Scatter name={`${isElectricity ? 'Electricity' : 'Gas'} Measures`} dataKey="y" fill={color} line={{ stroke: color, strokeWidth: 2 }} shape="circle" />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </Paper>
                            <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>
                                * Measures below the horizontal axis (if any) have negative cost (instant payback).
                            </Typography>
                        </>
                    );
                })()
            )}
        </Box>
    );
};

export default Step7_BaselineCurve;
