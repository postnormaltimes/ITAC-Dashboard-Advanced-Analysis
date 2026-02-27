import React, { useState } from 'react';
import { Box, Typography, Paper, Button, Slider, Stack, TextField, Divider } from '@mui/material';

interface Step4Props {
    onBack: () => void;
    onNext: (ranges: { emp: number[], sales: number[] }) => void;
}

const Step4_ClusterDef: React.FC<Step4Props> = ({ onBack, onNext }) => {
    // Defaults matching common SME analysis
    const [empRange, setEmpRange] = useState<number[]>([10, 500]);
    const [salesRange, setSalesRange] = useState<number[]>([1000000, 50000000]);

    const handleNext = () => {
        onNext({ emp: empRange, sales: salesRange });
    };

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 4: Define Cluster</Typography>
                    <Typography color="text.secondary">
                        Refine the analysis scope by filtering for specific firm sizes.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="contained" onClick={handleNext}>Next: Compare</Button>
                </Box>
            </Box>

            <Paper sx={{ p: 4 }}>
                <Stack spacing={4}>
                    <Box>
                        <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                            Number of Employees
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Target Range: {empRange[0]} - {empRange[1]} employees
                        </Typography>
                        <Slider
                            value={empRange}
                            onChange={(_, newValue) => setEmpRange(newValue as number[])}
                            valueLabelDisplay="auto"
                            min={0}
                            max={1000}
                            step={10}
                        />
                        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                            <TextField
                                label="Min"
                                type="number"
                                size="small"
                                value={empRange[0]}
                                onChange={(e) => setEmpRange([Number(e.target.value), empRange[1]])}
                            />
                            <TextField
                                label="Max"
                                type="number"
                                size="small"
                                value={empRange[1]}
                                onChange={(e) => setEmpRange([empRange[0], Number(e.target.value)])}
                            />
                        </Stack>
                    </Box>

                    <Divider />

                    <Box>
                        <Typography variant="subtitle1" gutterBottom fontWeight="bold">
                            Annual Sales ($)
                        </Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Target Range: ${salesRange[0].toLocaleString()} - ${salesRange[1].toLocaleString()}
                        </Typography>
                        <Slider
                            value={salesRange}
                            onChange={(_, newValue) => setSalesRange(newValue as number[])}
                            valueLabelDisplay="auto"
                            min={0}
                            max={100000000}
                            step={100000}
                        />
                        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                            <TextField
                                label="Min ($)"
                                type="number"
                                size="small"
                                value={salesRange[0]}
                                onChange={(e) => setSalesRange([Number(e.target.value), salesRange[1]])}
                            />
                            <TextField
                                label="Max ($)"
                                type="number"
                                size="small"
                                value={salesRange[1]}
                                onChange={(e) => setSalesRange([salesRange[0], Number(e.target.value)])}
                            />
                        </Stack>
                    </Box>
                </Stack>
            </Paper>
        </Box>
    );
};

export default Step4_ClusterDef;
