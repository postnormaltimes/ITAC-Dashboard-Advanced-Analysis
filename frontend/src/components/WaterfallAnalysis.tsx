
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Grid, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button, CircularProgress,
    Breadcrumbs, Link, Chip
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type { SearchFilters, WaterfallL1Item, WaterfallL2Item, WaterfallL3Item } from '../types';
import { api } from '../api/client';

// Plotly for Level 3 Scatter
// @ts-expect-error: Plotly types are missing
import Plotly from 'plotly.js-dist-min';
// @ts-expect-error: Plotly factory types are missing
import createPlotlyComponent from 'react-plotly.js/factory';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = createPlotlyComponent(Plotly as any);

interface WaterfallAnalysisProps {
    filters: SearchFilters;
}

const WaterfallAnalysis: React.FC<WaterfallAnalysisProps> = ({ filters }) => {
    // Navigation State
    const [selectedARC, setSelectedARC] = useState<string | null>(null);
    const [selectedNAICS, setSelectedNAICS] = useState<string | null>(null);
    const [step, setStep] = useState<1 | 2 | 3>(1);

    // Data State
    const [l1Data, setL1Data] = useState<WaterfallL1Item[]>([]);
    const [l2Data, setL2Data] = useState<WaterfallL2Item[]>([]);
    const [l3Data, setL3Data] = useState<WaterfallL3Item[]>([]);
    const [loading, setLoading] = useState<boolean>(false);

    // Initial Load (Level 1)


    const loadData = React.useCallback(async (targetStep: 1 | 2 | 3, arc: string | null, naics: string | null) => {
        setLoading(true);
        try {
            // Clone filters and apply hierarchy
            const currentFilters = { ...filters };
            if (arc) currentFilters.arc = arc;
            if (naics) currentFilters.naics = naics;

            const data = await api.getWaterfallAnalysis(currentFilters);

            if (targetStep === 1) {
                setL1Data(data.l1_data);
                setSelectedARC(null);
                setSelectedNAICS(null);
            } else if (targetStep === 2) {
                setL2Data(data.l2_data);
                setSelectedARC(arc);
                setSelectedNAICS(null);
            } else if (targetStep === 3) {
                setL3Data(data.l3_data);
                setSelectedARC(arc);
                setSelectedNAICS(naics);
            }
            setStep(targetStep);

        } catch (error) {
            console.error("Failed to load waterfall data", error);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    // Initial Load (Level 1)
    useEffect(() => {
        loadData(1, null, null);
    }, [filters, loadData]);

    const handleARCSelect = (arc: string) => {
        loadData(2, arc, null);
    };

    const handleNAICSSelect = (naics: string) => {
        if (!selectedARC) return;
        loadData(3, selectedARC, naics);
    };

    const handleBack = () => {
        if (step === 3) {
            loadData(2, selectedARC, null);
        } else if (step === 2) {
            loadData(1, null, null);
        }
    };

    const renderBreadcrumbs = () => (
        <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} aria-label="breadcrumb" sx={{ mb: 2 }}>
            <Link
                underline="hover"
                color={step === 1 ? "text.primary" : "inherit"}
                onClick={() => step > 1 && loadData(1, null, null)}
                sx={{ cursor: step > 1 ? 'pointer' : 'default' }}
            >
                Technology Group (ARC)
            </Link>
            {step > 1 && (
                <Link
                    underline="hover"
                    color={step === 2 ? "text.primary" : "inherit"}
                    onClick={() => step > 2 && loadData(2, selectedARC, null)}
                    sx={{ cursor: step > 2 ? 'pointer' : 'default' }}
                >
                    {selectedARC}
                </Link>
            )}
            {step > 2 && (
                <Typography color="text.primary">{selectedNAICS}</Typography>
            )}
        </Breadcrumbs>
    );

    if (loading && step === 1 && l1Data.length === 0) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                {step > 1 && (
                    <Button startIcon={<ArrowBackIcon />} onClick={handleBack} sx={{ mr: 2 }}>
                        Back
                    </Button>
                )}
                {renderBreadcrumbs()}
            </Box>

            {loading && <Box sx={{ width: '100%', height: 4, mb: 1 }}><CircularProgress size={24} /></Box>}

            {/* LEVEL 1: ARC Selection */}
            {step === 1 && (
                <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>Implementation Rate by Technology</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>ARC Code</TableCell>
                                            <TableCell align="right">Measures</TableCell>
                                            <TableCell align="right">Imp. Rate</TableCell>
                                            <TableCell align="right">Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {l1Data.map((row) => (
                                            <TableRow key={row.arc} hover>
                                                <TableCell component="th" scope="row">{row.arc}</TableCell>
                                                <TableCell align="right">{row.count}</TableCell>
                                                <TableCell align="right">
                                                    <Chip
                                                        label={`${row.implementation_rate.toFixed(1)}%`}
                                                        color={row.implementation_rate > 50 ? "success" : "default"}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button size="small" onClick={() => handleARCSelect(row.arc)}>
                                                        Select
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>Levelized Cost (LCOE) by Technology</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>ARC Code</TableCell>
                                            <TableCell align="right">Avg LCOE ($/kWh)</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {[...l1Data].sort((a, b) => a.avg_lcoe - b.avg_lcoe).map((row) => (
                                            <TableRow key={row.arc}>
                                                <TableCell>{row.arc}</TableCell>
                                                <TableCell align="right">${row.avg_lcoe.toFixed(4)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                </Grid>
            )}

            {/* LEVEL 2: NAICS Selection */}
            {step === 2 && (
                <Grid container spacing={3}>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>Implementation Rate by Sector (NAICS)</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>NAICS</TableCell>
                                            <TableCell align="right">Measures</TableCell>
                                            <TableCell align="right">Imp. Rate</TableCell>
                                            <TableCell align="right">Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {l2Data.map((row) => (
                                            <TableRow key={row.naics} hover>
                                                <TableCell component="th" scope="row">{row.naics}</TableCell>
                                                <TableCell align="right">{row.count}</TableCell>
                                                <TableCell align="right">
                                                    <Chip
                                                        label={`${row.implementation_rate.toFixed(1)}%`}
                                                        color={row.implementation_rate > 50 ? "success" : "default"}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button size="small" onClick={() => handleNAICSSelect(row.naics)}>
                                                        Select
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" gutterBottom>LCOE by Sector</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>NAICS</TableCell>
                                            <TableCell align="right">Avg LCOE ($/kWh)</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {[...l2Data].sort((a, b) => a.avg_lcoe - b.avg_lcoe).map((row) => (
                                            <TableRow key={row.naics}>
                                                <TableCell>{row.naics}</TableCell>
                                                <TableCell align="right">${row.avg_lcoe.toFixed(4)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                </Grid>
            )}

            {/* LEVEL 3: Sensitivity Scatter */}
            {step === 3 && (
                <Paper sx={{ p: 2, flexGrow: 1 }}>
                    <Typography variant="h6" gutterBottom>
                        Sensitivity Analysis: {selectedARC} in {selectedNAICS}
                    </Typography>
                    <Box sx={{ width: '100%', height: '100%' }}>
                        <Plot
                            data={[
                                {
                                    x: l3Data.map(d => d.employees),
                                    y: l3Data.map(d => d.yearly_savings),
                                    mode: 'markers',
                                    type: 'scatter',
                                    marker: {
                                        size: 12,
                                        color: l3Data.map(d => d.impstatus === 'Implemented' ? '#2e7d32' : '#1976d2'),
                                        opacity: 0.7
                                    },
                                    text: l3Data.map(d =>
                                        `Sales: $${d.sales.toLocaleString()}<br>Savings: ${d.yearly_savings.toFixed(0)} MWh<br>LCOE: $${d.lcoe.toFixed(3)}/kWh<br>Status: ${d.impstatus}`
                                    ),
                                    name: 'Facility'
                                }
                            ]}
                            layout={{
                                autosize: true,
                                title: 'Employees vs Annual Energy Savings',
                                xaxis: { title: 'Number of Employees' },
                                yaxis: { title: 'Annual Energy Savings (MWh)' },
                                hovermode: 'closest'
                            }}
                            useResizeHandler={true}
                            style={{ width: '100%', height: '500px' }}
                            config={{ responsive: true }}
                        />
                        <Typography variant="caption" align="center" display="block" sx={{ mt: 2 }}>
                            * Color indicates status: Green = Implemented, Blue = Recommended/Other
                        </Typography>
                    </Box>
                </Paper>
            )}
        </Box>
    );
};

export default WaterfallAnalysis;
