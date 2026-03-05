import React, { useEffect, useState } from 'react';
import {
    Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, Alert,
    CircularProgress, Tooltip, Stack, TextField, InputAdornment
} from '@mui/material';
import { api } from '../../api/client';
import { sanitizeMeasureDescription } from '../../utils/text';
import type { PriorityMeasure, FirmSizeCategory } from '../../types';

interface Step5CProps {
    naicsCode: string;
    selectedCategories: FirmSizeCategory[];
    // Lifted state — persists across back/forward navigation
    batAdditiveMax: number;
    setBatAdditiveMax: (v: number) => void;
    rankingMode: 'criticality' | 'priority';
    setRankingMode: (v: 'criticality' | 'priority') => void;
    onPriorityMeasuresLoaded: (measures: PriorityMeasure[]) => void;
    onBack: () => void;
    onNext: () => void;
}

const Step5C_PriorityIndex: React.FC<Step5CProps> = ({
    naicsCode, selectedCategories,
    batAdditiveMax, setBatAdditiveMax,
    rankingMode, setRankingMode, onPriorityMeasuresLoaded,
    onBack, onNext,
}) => {
    const [measures, setMeasures] = useState<PriorityMeasure[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.getStep5CPriorityIndex(
                naicsCode,
                selectedCategories.length ? selectedCategories : undefined,
                undefined,
                batAdditiveMax,
            );
            setMeasures(data.measures);
            onPriorityMeasuresLoaded(data.measures);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [naicsCode, selectedCategories, batAdditiveMax]);

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
                Step 5C — Priority Score
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                BAT-linked measures receive a weighted Priority Score adjusting their Criticality upwards to reflect their BAT alignment.
                Non-BAT measures keep their original Criticality score unchanged.
            </Typography>

            {/* Weight Controls */}
            <Box sx={{ mb: 3, maxWidth: 350 }}>
                <TextField
                    label="BAT additive (max points)"
                    type="number"
                    variant="outlined"
                    size="small"
                    fullWidth
                    value={batAdditiveMax}
                    onChange={(e) => {
                        let val = parseInt(e.target.value, 10);
                        if (isNaN(val)) val = 0;
                        setBatAdditiveMax(Math.max(0, Math.min(30, val)));
                    }}
                    InputProps={{
                        inputProps: { min: 0, max: 30, step: 1 },
                        endAdornment: <InputAdornment position="end">pts</InputAdornment>
                    }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Applied only to BAT-linked measures, scaled by mapping confidence.
                </Typography>
            </Box>

            {/* Ranking Mode selection */}
            <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Downstream ranking mode:
                </Typography>
                <Stack direction="row" spacing={1}>
                    <Chip
                        label="Criticality (original)"
                        variant={rankingMode === 'criticality' ? 'filled' : 'outlined'}
                        color={rankingMode === 'criticality' ? 'primary' : 'default'}
                        onClick={() => setRankingMode('criticality')}
                    />
                    <Chip
                        label="Priority (combined)"
                        variant={rankingMode === 'priority' ? 'filled' : 'outlined'}
                        color={rankingMode === 'priority' ? 'primary' : 'default'}
                        onClick={() => setRankingMode('priority')}
                    />
                </Stack>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

            {!loading && measures.length > 0 && (
                <TableContainer sx={{ maxHeight: 600, overflow: 'auto' }}>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>#</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>ARC</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">
                                    <Tooltip title={'Final adjusted score (Criticality + BAT premium)'}>
                                        <span>Priority Score</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">
                                    <Tooltip title={'Number of unique BATs mapped to this measure'}>
                                        <span>BATs</span>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {measures.map((m, idx) => (
                                <TableRow key={m.arc} hover>
                                    <TableCell>{idx + 1}</TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                        {m.arc}
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {sanitizeMeasureDescription(m.arc, m.description)}
                                            {m.is_bat_linked && (
                                                <Chip label="BAT-linked" size="small" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.65rem' }} />
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Chip
                                            label={m.priority_score}
                                            size="small"
                                            color={m.priority_score >= 60 ? 'success' : m.priority_score >= 30 ? 'warning' : 'default'}
                                            variant="filled"
                                        />
                                    </TableCell>
                                    <TableCell align="center">
                                        {m.is_bat_linked ? m.bat_count : '—'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Navigation */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
                <Button variant="outlined" onClick={onBack}>← Back</Button>
                <Button variant="contained" onClick={onNext}>
                    Next (using {rankingMode === 'priority' ? 'Priority' : 'Criticality'} ranking) →
                </Button>
            </Box>
        </Paper>
    );
};

export default Step5C_PriorityIndex;
