import React from 'react';
import { Box, TextField, Button, Typography, Paper, Stack } from '@mui/material';

interface Step1Props {
    onNext: (naics: string) => void;
}

const Step1_NAICS: React.FC<Step1Props> = ({ onNext }) => {
    const [naics, setNaics] = React.useState('');

    return (
        <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
            <Paper sx={{ p: 4 }}>
                <Typography variant="h5" gutterBottom>
                    Step 1: Select Industry
                </Typography>
                <Typography color="text.secondary" paragraph>
                    Enter a NAICS code to begin the analysis.
                </Typography>

                <Stack spacing={3}>
                    <TextField
                        label="NAICS Code"
                        value={naics}
                        onChange={(e) => setNaics(e.target.value)}
                        placeholder="e.g. 3323"
                        fullWidth
                    />

                    <Box>
                        <Typography variant="subtitle2" gutterBottom>
                            Try Demo Cases:
                        </Typography>
                        <Stack direction="row" spacing={2}>
                            <Button variant="outlined" onClick={() => setNaics('3323')}>
                                NAICS 3323 (Metals)
                            </Button>
                            <Button variant="outlined" onClick={() => setNaics('32221')}>
                                NAICS 32221 (Paper)
                            </Button>
                        </Stack>
                    </Box>

                    <Button
                        variant="contained"
                        size="large"
                        onClick={() => onNext(naics)}
                        disabled={!naics}
                    >
                        Evaluate Measures
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );
};

export default Step1_NAICS;
