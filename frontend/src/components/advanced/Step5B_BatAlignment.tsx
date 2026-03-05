import React, { useEffect, useState } from 'react';
import {
    Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, Switch, FormControlLabel, Select, MenuItem,
    InputLabel, FormControl, Alert, CircularProgress, Collapse, IconButton,
    Tooltip,
} from '@mui/material';
import { ExpandMore, ExpandLess, LinkOff, Link as LinkIcon } from '@mui/icons-material';
import { api } from '../../api/client';
import { sanitizeMeasureDescription } from '../../utils/text';
import type { BatAlignmentMeasure, BrefInfo, FirmSizeCategory } from '../../types';

interface Step5BProps {
    naicsCode: string;
    selectedCategories: FirmSizeCategory[];
    onBack: () => void;
    onNext: () => void;
}

const MATCH_TYPE_COLORS: Record<string, 'success' | 'warning' | 'default'> = {
    direct: 'success',
    partial: 'warning',
    proxy: 'default',
};

const Step5B_BatAlignment: React.FC<Step5BProps> = ({
    naicsCode, selectedCategories, onBack, onNext,
}) => {
    const [measures, setMeasures] = useState<BatAlignmentMeasure[]>([]);
    const [brefs, setBrefs] = useState<BrefInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [batOnly, setBatOnly] = useState(true);
    const [selectedBref, setSelectedBref] = useState<string>('');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.getStep5BBatAlignment(
                naicsCode,
                selectedCategories.length ? selectedCategories : undefined,
                selectedBref || undefined,
                batOnly,
            );
            setMeasures(data.measures);
            setBrefs(data.available_brefs);
        } catch (e: any) {
            setError(e?.response?.data?.detail || e?.message || 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, [naicsCode, selectedCategories, batOnly, selectedBref]);

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
                Step 5B — BAT Alignment & Improvement Gap
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Measures linked to BAT/BREF best available techniques. The Improvement Index (0–100)
                reflects how much room exists for implementation, weighted by evidence and confidence.
            </Typography>

            {/* Controls */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel>BREF Filter</InputLabel>
                    <Select
                        value={selectedBref}
                        label="BREF Filter"
                        onChange={(e) => setSelectedBref(e.target.value)}
                    >
                        <MenuItem value="">All BREFs</MenuItem>
                        {brefs.map((b) => (
                            <MenuItem key={b.brefId} value={b.brefId}>
                                {b.brefTitle}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <FormControlLabel
                    control={<Switch checked={batOnly} onChange={(_, v) => setBatOnly(v)} />}
                    label="Show only BAT-linked measures"
                />
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}

            {!loading && measures.length === 0 && !error && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    No BAT-linked measures found for this NAICS / BREF combination.
                    You can toggle "Show only BAT-linked" off to see all measures, or proceed to the next step.
                </Alert>
            )}

            {!loading && measures.length > 0 && (
                <TableContainer sx={{ maxHeight: 600, overflow: 'auto' }}>
                    <Table stickyHeader size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>ARC</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">Criticality</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">Rec.</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">Impl.</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">Impl Rate</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">Impl Gap</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">
                                    <Tooltip title="0–100: higher = more improvement potential">
                                        <span>Improvement Idx</span>
                                    </Tooltip>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">BATs</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {measures.map((m) => (
                                <React.Fragment key={m.arc}>
                                    <TableRow
                                        hover
                                        sx={{ cursor: m.bat_links.length ? 'pointer' : 'default' }}
                                        onClick={() => {
                                            if (m.bat_links.length) {
                                                setExpandedRow(expandedRow === m.arc ? null : m.arc);
                                            }
                                        }}
                                    >
                                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{m.arc}</TableCell>
                                        <TableCell>{sanitizeMeasureDescription(m.arc, m.description)}</TableCell>
                                        <TableCell align="center">{m.score.toFixed(0)}</TableCell>
                                        <TableCell align="center">{m.count}</TableCell>
                                        <TableCell align="center">{m.implemented_count}</TableCell>
                                        <TableCell align="center">{(m.imp_rate * 100).toFixed(1)}%</TableCell>
                                        <TableCell align="center">{(m.imp_gap * 100).toFixed(1)}%</TableCell>
                                        <TableCell align="center">
                                            {m.improvement_index !== null ? (
                                                <Chip
                                                    label={m.improvement_index}
                                                    size="small"
                                                    color={m.improvement_index >= 60 ? 'success' : m.improvement_index >= 30 ? 'warning' : 'default'}
                                                />
                                            ) : '—'}
                                        </TableCell>
                                        <TableCell align="center">
                                            {m.is_bat_linked ? (
                                                <IconButton size="small">
                                                    {expandedRow === m.arc ? <ExpandLess /> : <ExpandMore />}
                                                </IconButton>
                                            ) : (
                                                <LinkOff fontSize="small" color="disabled" />
                                            )}
                                        </TableCell>
                                    </TableRow>

                                    {/* Expandable BAT links */}
                                    <TableRow>
                                        <TableCell colSpan={9} sx={{ p: 0 }}>
                                            <Collapse in={expandedRow === m.arc} timeout="auto" unmountOnExit>
                                                <Box sx={{ p: 2, bgcolor: '#f5f5f5' }}>
                                                    <Typography variant="subtitle2" gutterBottom>
                                                        <LinkIcon fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} />
                                                        Linked BATs ({m.bat_links.length})
                                                    </Typography>
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow>
                                                                <TableCell>BAT ID</TableCell>
                                                                <TableCell>Title</TableCell>
                                                                <TableCell>Role</TableCell>
                                                                <TableCell>Match</TableCell>
                                                                <TableCell>Confidence</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {m.bat_links.map((bl, idx) => (
                                                                <TableRow key={idx}>
                                                                    <TableCell sx={{ fontFamily: 'monospace' }}>{bl.batId}</TableCell>
                                                                    <TableCell>{bl.batTitle}</TableCell>
                                                                    <TableCell>
                                                                        <Chip
                                                                            label={bl.matchRole}
                                                                            size="small"
                                                                            color={bl.matchRole === 'primary' ? 'primary' : 'default'}
                                                                            variant="outlined"
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Chip
                                                                            label={bl.matchType}
                                                                            size="small"
                                                                            color={MATCH_TYPE_COLORS[bl.matchType] || 'default'}
                                                                        />
                                                                    </TableCell>
                                                                    <TableCell>{(bl.confidence * 100).toFixed(0)}%</TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </Box>
                                            </Collapse>
                                        </TableCell>
                                    </TableRow>
                                </React.Fragment>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Navigation */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
                <Button variant="outlined" onClick={onBack}>← Back</Button>
                <Button variant="contained" onClick={onNext}>Next →</Button>
            </Box>
        </Paper>
    );
};

export default Step5B_BatAlignment;
