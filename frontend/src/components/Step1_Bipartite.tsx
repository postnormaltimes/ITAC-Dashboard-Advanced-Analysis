import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Button
} from '@mui/material';
import { api } from '../api/client';
import type { Step1Response } from '../types';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from 'recharts';

interface Step1Props {
    pivotType: 'naics' | 'arc';
    pivotId: string;
    onNext: (item: { id: string }) => void;
    onBack: () => void;
}

const Step1_Bipartite: React.FC<Step1Props> = ({ pivotType, pivotId, onNext, onBack }) => {
    const [data, setData] = useState<Step1Response | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const result = await api.getStep1(pivotType, pivotId);
                setData(result);
            } catch (error) {
                console.error("Failed to fetch Step 1 data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [pivotType, pivotId]);

    const targetLabel = pivotType === 'naics' ? 'Measures (ARC)' : 'Industries (NAICS)';

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4">
                    Step 1: Bipartite Pivot
                    <Typography component="span" variant="h5" color="text.secondary" sx={{ ml: 2 }}>
                        {pivotType.toUpperCase()} {pivotId}
                    </Typography>
                </Typography>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Change Selection</Button>
                    <Button
                        variant="contained"
                        onClick={() => selectedId && onNext({ id: selectedId })}
                        disabled={!data || !selectedId}
                    >
                        Next Step
                    </Button>
                </Box>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress /></Box>
            ) : data ? (
                <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
                    {/* Left: Ranked Table */}
                    <Paper sx={{ flex: 1, p: 2 }}>
                        <Typography variant="h6" gutterBottom>Ranked {targetLabel}</Typography>
                        <TableContainer sx={{ maxHeight: 500 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Rank</TableCell>
                                        <TableCell>ID</TableCell>
                                        <TableCell align="right">Count</TableCell>
                                        <TableCell align="right">Payback (yrs)</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {data.ranking.map((row, index) => (
                                        <TableRow
                                            key={row.id}
                                            hover
                                            selected={selectedId === row.id}
                                            onClick={() => setSelectedId(row.id)}
                                            sx={{ cursor: 'pointer' }}
                                        >
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{row.id}</TableCell>
                                            <TableCell align="right">{row.count}</TableCell>
                                            <TableCell align="right">{row.payback.toFixed(1)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>

                    {/* Right: Scatter Plot */}
                    <Paper sx={{ flex: 2, p: 2, minHeight: 500 }}>
                        <Typography variant="h6" gutterBottom>Cross-Elasticity: Payback vs. Propensity</Typography>
                        <ResponsiveContainer width="100%" height={450}>
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid />
                                <XAxis type="number" dataKey="x" name="Median Payback" unit=" yrs" />
                                <YAxis type="number" dataKey="y" name="Propensity (Count)" unit="" />
                                <ZAxis type="number" dataKey="size" range={[50, 400]} name="Energy Savings" />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                                <Scatter name="Opportunities" data={data.scatter_data} fill="#8884d8" />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </Paper>
                </Box>
            ) : (
                <Typography color="error">Failed to load data.</Typography>
            )}
        </Box>
    );
};

export default Step1_Bipartite;
