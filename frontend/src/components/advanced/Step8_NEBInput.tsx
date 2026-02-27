import { Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Chip } from '@mui/material';
import type { AdvancedMeasure } from '../../types';
import { sanitizeMeasureDescription } from '../../utils/text';

interface Step8Props {
    measures: AdvancedMeasure[]; // Full list or filtered list? better pass full list and filter by ID
    selectedMeasureIds: string[];
    nebInputs: Record<string, { opCost: number, nebValue: number }>;
    setNebInputs: (inputs: Record<string, { opCost: number, nebValue: number }>) => void;
    onBack: () => void;
    onNext: () => void;
}

const Step8_NEBInput: React.FC<Step8Props> = ({ measures, selectedMeasureIds, nebInputs, setNebInputs, onBack, onNext }) => {
    // Filter measures to only show selected ones
    const selectedMeasures = measures.filter(m => selectedMeasureIds.includes(m.arc));

    const handleInputChange = (id: string, field: 'opCost' | 'nebValue', value: string) => {
        const numVal = parseFloat(value) || 0;
        setNebInputs({
            ...nebInputs,
            [id]: {
                ...nebInputs[id],
                [field]: numVal
            }
        });
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 8: Non-Energy Benefits (NEB)</Typography>
                    <Typography color="text.secondary">
                        Quantify operational impacts to adjust the financial curve.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button variant="contained" onClick={onNext}>Next: Gap Analysis</Button>
                </Box>
            </Box>

            <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>ARC Code</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell>NEB Source Codes</TableCell>
                            <TableCell align="right">Energy Savings ($)</TableCell>
                            <TableCell align="right">Imp. Cost ($)</TableCell>
                            <TableCell align="right" sx={{ bgcolor: '#e3f2fd' }}>Op. Cost Increase ($/yr)</TableCell>
                            <TableCell align="right" sx={{ bgcolor: '#e8f5e9' }}>Non-Energy Benefits ($/yr)</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {selectedMeasures.map((m) => {
                            const inputs = nebInputs[m.arc] || { opCost: 0, nebValue: 0 };
                            // Approximate Energy Savings $ = Payback formula inverse? 
                            // We don't have exact $ savings here without industry cost.
                            // But we can show other static info.
                            return (
                                <TableRow key={m.arc} hover>
                                    <TableCell>{m.arc}</TableCell>
                                    <TableCell>{sanitizeMeasureDescription(m.arc, m.description)}</TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                            {m.neb_codes && m.neb_codes.length > 0 ? (
                                                m.neb_codes.map(code => (
                                                    <Chip key={code} label={code} size="small" color="secondary" variant="outlined" />
                                                ))
                                            ) : (
                                                <Typography variant="caption" color="text.secondary">None</Typography>
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell align="right">${Math.round(m.gross_savings).toLocaleString()}</TableCell>
                                    <TableCell align="right">-</TableCell>
                                    <TableCell align="right" sx={{ bgcolor: '#e3f2fd' }}>
                                        <TextField
                                            size="small"
                                            type="number"
                                            value={inputs.opCost || ''}
                                            onChange={(e) => handleInputChange(m.arc, 'opCost', e.target.value)}
                                            placeholder="0"
                                            InputProps={{ inputProps: { min: 0 } }}
                                        />
                                    </TableCell>
                                    <TableCell align="right" sx={{ bgcolor: '#e8f5e9' }}>
                                        <TextField
                                            size="small"
                                            type="number"
                                            value={inputs.nebValue || ''}
                                            onChange={(e) => handleInputChange(m.arc, 'nebValue', e.target.value)}
                                            placeholder="0"
                                            InputProps={{ inputProps: { min: 0 } }}
                                        />
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

export default Step8_NEBInput;
