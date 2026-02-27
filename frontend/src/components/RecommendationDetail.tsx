import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,

    Divider,
    Box,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableRow,
    Paper,
    IconButton,
    CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { api } from '../api/client';
import type { RecommendationDetail } from '../types';

interface DetailProps {
    id: string | null;
    open: boolean;
    onClose: () => void;
}

const RecommendationDetailView: React.FC<DetailProps> = ({ id, open, onClose }) => {
    const [data, setData] = useState<RecommendationDetail | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    useEffect(() => {
        if (id && open) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLoading(true);
            api.getRecommendationDetail(id)
                .then(setData)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [id, open]);

    if (!open) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" component="div">
                    Recommendation Details: {id}
                </Typography>
                <IconButton onClick={onClose} aria-label="close" size="small">
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent dividers>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                ) : data ? (
                    <Box>
                        {/* Header Info */}
                        <Box mb={2}>
                            <Typography variant="subtitle1" color="textSecondary" gutterBottom>
                                {data.description}
                            </Typography>
                            <Box mt={1} display="flex" gap={1} flexWrap="wrap">
                                <Chip label={`ARC: ${data.arc}`} color="primary" variant="outlined" />
                                <Chip label={`FY ${data.fy}`} variant="outlined" />
                                <Chip
                                    label={data.impstatus}
                                    color={data.impstatus === 'Implemented' ? 'success' : 'default'}
                                />
                                <Chip label={data.state} variant="outlined" />
                            </Box>
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={3}>
                            {/* Facility Context */}
                            <Box>
                                <Typography variant="h6" gutterBottom>Facility Context</Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableBody>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>Facility ID</TableCell>
                                                <TableCell>{data.center}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>NAICS Code</TableCell>
                                                <TableCell>{data.naics || 'N/A'}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>Employees</TableCell>
                                                <TableCell>{data.employees?.toLocaleString()}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>Annual Sales</TableCell>
                                                <TableCell>${data.sales?.toLocaleString()}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>Products</TableCell>
                                                <TableCell>{data.products || 'N/A'}</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>

                            {/* Economics */}
                            <Box>
                                <Typography variant="h6" gutterBottom>Economics & Savings</Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableBody>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>Implementation Cost</TableCell>
                                                <TableCell>${data.implementation_cost?.toLocaleString()}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>Annual Savings</TableCell>
                                                <TableCell>${data.yearly_savings?.toLocaleString()}</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>Payback Period</TableCell>
                                                <TableCell>{data.payback?.toFixed(1)} years</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>Electric Savings</TableCell>
                                                <TableCell>{data.psaved?.toLocaleString()} kWh</TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell component="th" sx={{ fontWeight: 'bold' }}>Fuel Savings</TableCell>
                                                <TableCell>{data.ssaved?.toLocaleString()} MMBtu</TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        </Box>
                    </Box>
                ) : (
                    <Typography color="error">Failed to load details.</Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} variant="contained">Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default RecommendationDetailView;
