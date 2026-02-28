import React, { useState } from 'react';
import { Box, Typography, Paper, Button, Checkbox, FormControlLabel, FormGroup, Alert } from '@mui/material';
import type { FirmSizeCategory } from '../../types';

const CATEGORIES: { key: FirmSizeCategory; label: string; empDesc: string; salesDesc: string }[] = [
    { key: 'micro', label: 'Micro', empDesc: '< 10 employees', salesDesc: '≤ $2M turnover' },
    { key: 'small', label: 'Small', empDesc: '< 50 employees', salesDesc: '≤ $10M turnover' },
    { key: 'medium', label: 'Medium', empDesc: '< 250 employees', salesDesc: '≤ $50M turnover' },
    { key: 'large', label: 'Large', empDesc: '≥ 250 employees', salesDesc: '> $50M turnover' },
];

interface Step4Props {
    onBack: () => void;
    onNext: (categories: FirmSizeCategory[]) => void;
}

const Step4_ClusterDef: React.FC<Step4Props> = ({ onBack, onNext }) => {
    const [selected, setSelected] = useState<Set<FirmSizeCategory>>(new Set(['small', 'medium']));

    const handleToggle = (cat: FirmSizeCategory) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(cat)) {
                next.delete(cat);
            } else {
                if (next.size >= 2) return prev; // Prevent > 2
                next.add(cat);
            }
            return next;
        });
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 4: Define Cluster</Typography>
                    <Typography color="text.secondary">
                        Select up to 2 firm-size categories to define your cluster for comparison.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button
                        variant="contained"
                        onClick={() => onNext(Array.from(selected))}
                        disabled={selected.size === 0}
                    >
                        Next: Comparison
                    </Button>
                </Box>
            </Box>

            {selected.size >= 2 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Maximum of 2 categories selected. Deselect one to change.
                </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {CATEGORIES.map(cat => (
                    <Paper
                        key={cat.key}
                        sx={{
                            p: 3, flex: '1 1 200px', cursor: 'pointer',
                            border: selected.has(cat.key) ? '2px solid' : '2px solid transparent',
                            borderColor: selected.has(cat.key) ? 'primary.main' : 'transparent',
                            opacity: !selected.has(cat.key) && selected.size >= 2 ? 0.5 : 1,
                            transition: 'all 0.2s',
                            '&:hover': { borderColor: selected.size < 2 || selected.has(cat.key) ? 'primary.light' : 'transparent' },
                        }}
                        onClick={() => handleToggle(cat.key)}
                    >
                        <FormGroup>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={selected.has(cat.key)}
                                        disabled={!selected.has(cat.key) && selected.size >= 2}
                                    />
                                }
                                label={<Typography variant="h6">{cat.label}</Typography>}
                            />
                        </FormGroup>
                        <Typography variant="body2" color="text.secondary">{cat.empDesc}</Typography>
                        <Typography variant="body2" color="text.secondary">{cat.salesDesc}</Typography>
                    </Paper>
                ))}
            </Box>

            <Typography variant="caption" sx={{ mt: 2, display: 'block' }}>
                Selected: {Array.from(selected).join(', ') || 'None'}
            </Typography>
        </Box>
    );
};

export default Step4_ClusterDef;
