import React, { useState } from 'react';
import { Box, Typography, Paper, Button, Checkbox, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { AdvancedMeasure } from '../../types';
import { sanitizeMeasureDescription } from '../../utils/text';

interface Step6Props {
    measures: AdvancedMeasure[]; // From Step 5 / Cluster
    onBack: () => void;
    onNext: (selectedIds: string[]) => void;
}

const Step6_Selection: React.FC<Step6Props> = ({ measures, onBack, onNext }) => {
    // Default select all? Or top 10?
    // Let's select top 10 by default
    const [selected, setSelected] = useState<string[]>(measures.slice(0, 10).map(m => m.arc));

    const handleToggle = (arc: string) => {
        if (selected.includes(arc)) {
            setSelected(selected.filter(id => id !== arc));
        } else {
            setSelected([...selected, arc]);
        }
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelected(measures.map(m => m.arc));
        } else {
            setSelected([]);
        }
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, alignItems: 'center' }}>
                <Box>
                    <Typography variant="h5">Step 6: Measure Selection</Typography>
                    <Typography color="text.secondary">
                        Select the measures to include in the Cost Curve and Financial Analysis.
                    </Typography>
                </Box>
                <Box>
                    <Button onClick={onBack} sx={{ mr: 1 }}>Back</Button>
                    <Button
                        variant="contained"
                        onClick={() => onNext(selected)}
                        disabled={selected.length === 0}
                    >
                        Next: Cost Curves
                    </Button>
                </Box>
            </Box>

            <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox">
                                <Checkbox
                                    checked={selected.length === measures.length && measures.length > 0}
                                    indeterminate={selected.length > 0 && selected.length < measures.length}
                                    onChange={(e) => handleSelectAll(e.target.checked)}
                                />
                            </TableCell>
                            <TableCell>ARC Code</TableCell>
                            <TableCell>Description</TableCell>
                            <TableCell align="right">Score</TableCell>
                            <TableCell align="right">Payback (Yrs)</TableCell>
                            <TableCell align="right">CCE</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {measures.map((row) => {
                            const isSelected = selected.includes(row.arc);
                            return (
                                <TableRow
                                    key={row.arc}
                                    hover
                                    selected={isSelected}
                                    onClick={() => handleToggle(row.arc)}
                                    sx={{ cursor: 'pointer' }}
                                >
                                    <TableCell padding="checkbox">
                                        <Checkbox checked={isSelected} />
                                    </TableCell>
                                    <TableCell>{row.arc}</TableCell>
                                    <TableCell>{sanitizeMeasureDescription(row.arc, row.description)}</TableCell>
                                    <TableCell align="right">{row.score.toFixed(1)}</TableCell>
                                    <TableCell align="right">{row.payback.toFixed(1)}</TableCell>
                                    <TableCell align="right">${row.cce.toFixed(2)}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
            <Typography variant="caption" sx={{ mt: 1 }}>
                Selected: {selected.length} measures
            </Typography>
        </Box>
    );
};

export default Step6_Selection;
