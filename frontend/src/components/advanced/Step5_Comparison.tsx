import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress } from '@mui/material';
import { api } from '../../api/client';
import type { AdvancedMeasure, AdvancedStep3Response } from '../../types';
import { sanitizeMeasureDescription } from '../../utils/text';

interface Step5Props {
    naicsCode: string;
    genericMeasures: AdvancedMeasure[];
    clusterRanges: { emp: number[], sales: number[] };
    onBack: () => void;
    onNext: (clusterMeasures: AdvancedMeasure[]) => void;
}

const Step5_Comparison: React.FC<Step5Props> = ({ naicsCode, genericMeasures, clusterRanges, onBack, onNext }) => {
    const [loading, setLoading] = useState(true);
    const [clusterData, setClusterData] = useState<AdvancedStep3Response | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const data = await api.getAdvancedStep3(
                    naicsCode,
                    clusterRanges.emp[0], clusterRanges.emp[1],
                    clusterRanges.sales[0], clusterRanges.sales[1]
                );
                if (mounted) setClusterData(data);
            } catch (err) {
                console.error(err);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [naicsCode, clusterRanges]);

    if (loading) return <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>;
    if (!clusterData) return <Box sx={{ p: 4, textAlign: 'center' }}>Failed to load comparison.</Box>;

    // Join Generic and Cluster measures by ARC
    // Create a map of Generic
    const genericMap = new Map(genericMeasures.map(m => [m.arc, m]));

    // Rows = Cluster Measures
    const rows = clusterData.cluster_metrics.slice(0, 50).map(cm => {
        const gm = genericMap.get(cm.arc);
        return {
            arc: cm.arc,
            desc: sanitizeMeasureDescription(cm.arc, cm.description),
            cluster: cm,
            generic: gm
        };
    });

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 5: Cluster Comparison</Typography>
                    <Typography color="text.secondary">
                        Comparing {clusterData.cluster_size} firms in cluster vs Industry Baseline.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="contained" onClick={() => onNext(clusterData.cluster_metrics)}>Next: Selection</Button>
                </Box>
            </Box>

            <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Measure</TableCell>
                            <TableCell align="center" colSpan={3} sx={{ borderLeft: '1px solid #eee' }}>Score</TableCell>
                            <TableCell align="center" colSpan={3} sx={{ borderLeft: '1px solid #eee' }}>Payback (Yrs)</TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell>ARC Code</TableCell>

                            <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>Generic</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Cluster</TableCell>
                            <TableCell align="right">Diff</TableCell>

                            <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>Generic</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Cluster</TableCell>
                            <TableCell align="right">Diff</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => {
                            const scoreDiff = row.cluster.score - (row.generic?.score || 0);
                            const paybackDiff = row.cluster.payback - (row.generic?.payback || 0);
                            return (
                                <TableRow key={row.arc} hover>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="bold">{row.arc}</Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 200, display: 'block' }}>
                                            {row.desc}
                                        </Typography>
                                    </TableCell>

                                    <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>
                                        {row.generic?.score.toFixed(1) || '-'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                        {row.cluster.score.toFixed(1)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: scoreDiff > 0 ? 'success.main' : 'error.main' }}>
                                        {scoreDiff > 0 ? '+' : ''}{scoreDiff.toFixed(1)}
                                    </TableCell>

                                    <TableCell align="right" sx={{ borderLeft: '1px solid #eee', color: 'text.secondary' }}>
                                        {row.generic?.payback.toFixed(1) || '-'}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                        {row.cluster.payback.toFixed(1)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ color: paybackDiff < 0 ? 'success.main' : 'error.main' }}>
                                        {paybackDiff > 0 ? '+' : ''}{paybackDiff.toFixed(1)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default Step5_Comparison;
