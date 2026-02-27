
import React from 'react';
import {
    Box, TextField, FormControl, InputLabel, Select, MenuItem, Button,
    Typography, Chip
} from '@mui/material';
// import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { SearchFilters, IFacetsResponse } from '../types';

interface FilterSidebarProps {
    filters: SearchFilters;
    onFilterChange: (newFilters: SearchFilters) => void;
    facets?: IFacetsResponse;
}

const FilterSidebar: React.FC<FilterSidebarProps> = ({ filters, onFilterChange, facets }) => {

    const handleTextChange = (field: keyof SearchFilters, value: string) => {
        onFilterChange({ ...filters, [field]: value });
    };

    const handleOperatorChange = (field: 'year' | 'savings' | 'cost', operator: string) => {
        const currentfilter = filters[field] || { operator: '>=', value: '' };
        onFilterChange({
            ...filters,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [field]: { ...currentfilter, operator: operator as any }
        });
    };

    const handleNumericValueChange = (field: 'year' | 'savings' | 'cost', value: string) => {
        const currentfilter = filters[field] || { operator: '>=', value: '' };
        onFilterChange({
            ...filters,
            [field]: { ...currentfilter, value: value === '' ? '' : Number(value) }
        });
    };

    const operators = ['>=', '<=', '==', '>', '<'];

    return (
        <Box sx={{ width: 300, p: 2, borderRight: '1px solid #ddd', height: '100vh', overflowY: 'auto' }}>
            <Typography variant="h6" gutterBottom>Filters</Typography>

            {/* ARC Filter */}
            <Box mb={2}>
                <TextField
                    label="ARC Code (2+ digits)"
                    fullWidth
                    size="small"
                    value={filters.arc || ''}
                    onChange={(e) => handleTextChange('arc', e.target.value)}
                    helperText={facets?.arc ? `Top ARCs: ${facets.arc.slice(0, 3).map(a => a.value).join(', ')}` : ''}
                />
            </Box>

            {/* Status Filter */}
            <Box mb={2}>
                <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                        multiple
                        value={filters.status || []}
                        label="Status"
                        onChange={(e) => {
                            const value = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
                            onFilterChange({ ...filters, status: value });
                        }}
                        renderValue={(selected) => (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {selected.map((value) => (
                                    <Chip key={value} label={value} size="small" />
                                ))}
                            </Box>
                        )}
                    >
                        {facets?.status.map((option) => (
                            <MenuItem key={option.value} value={option.value}>
                                {option.value} ({option.count})
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Box>

            {/* Numeric Filters (Year, Savings, Cost) */}
            {['year', 'savings', 'cost'].map((field) => (
                <Box mb={2} key={field}>
                    <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>{field}</Typography>
                    <Box display="flex">
                        <FormControl size="small" sx={{ minWidth: 70, mr: 1 }}>
                            <Select
                                value={filters[field as 'year']?.operator || '>='}
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onChange={(e) => handleOperatorChange(field as any, e.target.value)}
                            >
                                {operators.map(op => <MenuItem key={op} value={op}>{op}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField
                            type="number"
                            size="small"
                            fullWidth
                            value={filters[field as 'year']?.value || ''}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onChange={(e) => handleNumericValueChange(field as any, e.target.value)}
                        />
                    </Box>
                </Box>
            ))}

            <Button
                variant="outlined"
                fullWidth
                onClick={() => onFilterChange({})}
            >
                Reset Filters
            </Button>
        </Box>
    );
};

export default FilterSidebar;
