import React, { useEffect, useState } from 'react';
import {
    Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, Slider, Alert,
    CircularProgress, Tooltip, Stack,
} from '@mui/material';
import { api } from '../../api/client';
import { sanitizeMeasureDescription } from '../../utils/text';
import type { PriorityMeasure, FirmSizeCategory } from '../../types';

interface Step5CProps {
    naicsCode: string;
    selectedCategories: FirmSizeCategory[];
    // Lifted state — persists across back/forward navigation
    wImprovement: number;
    setWImprovement: (v: number) => void;
    rankingMode: 'criticality' | 'priority';
    setRankingMode: (v: 'criticality' | 'priority') => void;
    onPriorityMeasuresLoaded: (measures: PriorityMeasure[]) => void;
    onBack: () => void;
    onNext: () => void;
}

const Step5C_PriorityIndex: React.FC<Step5CProps> = ({
    naicsCode, selectedCategories,
    wImprovement, setWImprovement,
    rankingMode, setRankingMode, onPriorityMeasuresLoaded,
    onBack, onNext,
}) => {
    const [measures, setMeasures] = useState<PriorityMeasure[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const wCrit = 100 - wImprovement;

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.getStep5CPriorityIndex(
                naicsCode,
                selectedCategories.length ? selectedCategories : undefined,
                undefined,
                wImprovement,
            );
            setMeasures(data.measures);
            onPriorityMeasuresLoaded(data.measures);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [naicsCode, selectedCategories, wImprovement]);

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
                Step 5C — Priority Score
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                BAT-linked measures receive a weighted Priority Score combining Criticality and Improvement.
                Non-BAT measures keep their original Criticality score unchanged.
            </Typography>

            {/* Weight Controls */}
            <Box sx={{ mb: 3, maxWidth: 500 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Criticality Weight: {wCrit}% — Improvement Weight: {wImprovement}%
                </Typography>
                <Slider
                    value={wImprovement}
                    onChange={(_, v) => setWImprovement(v as number)}
                    min={0}
                    max={100}
                    step={5}
                    marks={[
                        { value: 0, label: '0%' },
                        { value: 50, label: '50/50' },
                        { value: 100, label: '100%' },
                    ]}
                    valueLabelDisplay="auto"
                    valueLabelFormat={(v) => `Imp: ${v}%`}
                />
                <Typography variant="caption" color="text.secondary">
                    Increasing the improvement weight boosts BAT-linked measures with high implementation gaps.
                    Non-BAT measures are unaffected.
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
                                <TableCell sx={{ fontWeight: 700 }} align="center">BAT</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">Criticality</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">Improvement</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">
                                    <Tooltip title={`BAT: (${wCrit}% × Crit + ${wImprovement}% × Imp) | Non-BAT: = Criticality`}>
                                        <span>Priority Score</span>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {measures.map((m, idx) => (
                                <TableRow key={m.arc} hover>
                                    <TableCell>{idx + 1}</TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{m.arc}</TableCell>
                                    <TableCell>{sanitizeMeasureDescription(m.arc, m.description)}</TableCell>
                                    <TableCell align="center">
                                        {m.is_bat_linked ? (
                                            <Chip
                                                label={`BAT (${m.bat_link_count})`}
                                                size="small"
                                                variant="outlined"
                                                color="primary"
                                            />
                                        ) : '—'}
                                    </TableCell>
                                    <TableCell align="center">{m.criticality_index.toFixed(0)}</TableCell>
                                    <TableCell align="center">
                                        {m.is_bat_linked ? (
                                            m.improvement_index !== null ? (
                                                <Chip
                                                    label={m.improvement_index}
                                                    size="small"
                                                    color={m.improvement_index >= 60 ? 'success' : m.improvement_index >= 30 ? 'warning' : 'default'}
                                                />
                                            ) : (
                                                <Tooltip title="Insufficient BAT data (recommended count = 0)">
                                                    <Chip label="N/A" size="small" color="default" variant="outlined" />
                                                </Tooltip>
                                            )
                                        ) : '—'}
                                    </TableCell>
                                    <TableCell align="center">
                                        <Chip
                                            label={m.priority_score}
                                            size="small"
                                            color={m.priority_score >= 60 ? 'success' : m.priority_score >= 30 ? 'warning' : 'default'}
                                            variant="filled"
                                        />
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
