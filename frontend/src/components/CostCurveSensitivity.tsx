
import React from 'react';
import {
    Box, Typography, Slider, TextField, FormControlLabel, Switch, Divider, Paper
} from '@mui/material';
import type { CostCurveParams } from '../types';

interface CostCurveSensitivityProps {
    params: CostCurveParams;
    onChange: (newParams: CostCurveParams) => void;
}

const CostCurveSensitivity: React.FC<CostCurveSensitivityProps> = ({ params, onChange }) => {

    const handleChange = (field: keyof CostCurveParams, value: number | boolean) => {
        onChange({ ...params, [field]: value });
    };

    return (
        <Paper elevation={2} sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
            <Typography variant="h6" gutterBottom>
                Curve Sensitivity
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ mb: 3 }}>
                <Typography id="discount-rate-slider" gutterBottom>
                    Discount Rate: {(params.discount_rate * 100).toFixed(0)}%
                </Typography>
                <Slider
                    value={params.discount_rate * 100}
                    min={0}
                    max={20}
                    step={1}
                    onChange={(_, val) => handleChange('discount_rate', (val as number) / 100)}
                    aria-labelledby="discount-rate-slider"
                />
            </Box>

            <Box sx={{ mb: 3 }}>
                <Typography id="lifetime-slider" gutterBottom>
                    Measure Lifetime: {params.lifetime} years
                </Typography>
                <Slider
                    value={params.lifetime}
                    min={1}
                    max={30}
                    step={1}
                    onChange={(_, val) => handleChange('lifetime', val as number)}
                    aria-labelledby="lifetime-slider"
                />
            </Box>

            <Box sx={{ mb: 3 }}>
                <TextField
                    label="Energy Price ($/kWh)"
                    type="number"
                    value={params.energy_price}
                    onChange={(e) => handleChange('energy_price', parseFloat(e.target.value))}
                    fullWidth
                    inputProps={{ step: 0.01 }}
                />
            </Box>

            <Divider sx={{ mb: 2 }} />
            <Typography variant="subtitle1" gutterBottom>
                Adders & Subtractors
            </Typography>

            <FormControlLabel
                control={
                    <Switch
                        checked={params.include_program_costs}
                        onChange={(e) => handleChange('include_program_costs', e.target.checked)}
                    />
                }
                label="Include Program Costs (Societal)"
            />

            {params.include_program_costs && (
                <Box sx={{ mt: 1, mb: 2 }}>
                    <Typography gutterBottom variant="body2">
                        Program Cost Adder: {(params.program_cost_adder * 100).toFixed(0)}%
                    </Typography>
                    <Slider
                        value={params.program_cost_adder * 100}
                        min={0}
                        max={100}
                        step={5}
                        onChange={(_, val) => handleChange('program_cost_adder', (val as number) / 100)}
                        size="small"
                    />
                </Box>
            )}

            <Box sx={{ mt: 2 }}>
                <Typography gutterBottom variant="body2">
                    Transaction Cost Adder: {(params.transaction_cost_adder * 100).toFixed(0)}%
                </Typography>
                <Slider
                    value={params.transaction_cost_adder * 100}
                    min={0}
                    max={50}
                    step={1}
                    onChange={(_, val) => handleChange('transaction_cost_adder', (val as number) / 100)}
                    size="small"
                />
            </Box>

        </Paper>
    );
};

export default CostCurveSensitivity;
