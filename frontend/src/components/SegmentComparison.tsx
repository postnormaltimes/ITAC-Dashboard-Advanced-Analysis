
import React, { useState } from 'react';
import { Box, Typography, Button, Drawer, Grid, Paper, Divider } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import FilterSidebar from './FilterSidebar';
import DashboardKPIs from './DashboardKPIs';
import type { SearchFilters } from '../types';

const SegmentComparison: React.FC = () => {
    const [filtersA, setFiltersA] = useState<SearchFilters>({});
    const [filtersB, setFiltersB] = useState<SearchFilters>({});

    // Drawers for filters
    const [openA, setOpenA] = useState(false);
    const [openB, setOpenB] = useState(false);

    return (
        <Box height="100%" display="flex" flexDirection="column" overflow="hidden">
            <Box p={2} borderBottom={1} borderColor="divider">
                <Typography variant="h5">Segment Comparison (A/B Testing)</Typography>
                <Typography variant="body2" color="textSecondary">
                    Compare key metrics between two different filter sets (e.g. Region vs Region).
                </Typography>
            </Box>

            <Grid container spacing={0} sx={{ flex: 1, overflow: 'hidden' }}>
                {/* Segment A */}
                <Grid size={{ xs: 12, md: 6 }} sx={{ borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
                    <Box p={2} bgcolor="grey.50" display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Segment A</Typography>
                        <Button
                            startIcon={<FilterListIcon />}
                            variant="outlined"
                            size="small"
                            onClick={() => setOpenA(true)}
                        >
                            Filters
                        </Button>
                    </Box>
                    <Box p={2} flex={1} overflow="auto">
                        <FilterSummary filters={filtersA} />
                        <Divider sx={{ my: 2 }} />
                        <DashboardKPIs filters={filtersA} />
                    </Box>
                </Grid>

                {/* Segment B */}
                <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Box p={2} bgcolor="grey.50" display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Segment B</Typography>
                        <Button
                            startIcon={<FilterListIcon />}
                            variant="outlined"
                            size="small"
                            onClick={() => setOpenB(true)}
                        >
                            Filters
                        </Button>
                    </Box>
                    <Box p={2} flex={1} overflow="auto">
                        <FilterSummary filters={filtersB} />
                        <Divider sx={{ my: 2 }} />
                        <DashboardKPIs filters={filtersB} />
                    </Box>
                </Grid>
            </Grid>

            {/* Filter Drawers */}
            <Drawer anchor="left" open={openA} onClose={() => setOpenA(false)}>
                <Box width={300} role="presentation">
                    <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Filter Segment A</Typography>
                        <Button onClick={() => setFiltersA({})}>Clear</Button>
                    </Box>
                    <Divider />
                    <FilterSidebar filters={filtersA} onFilterChange={setFiltersA} />
                </Box>
            </Drawer>

            <Drawer anchor="right" open={openB} onClose={() => setOpenB(false)}>
                <Box width={300} role="presentation">
                    <Box p={2} display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Filter Segment B</Typography>
                        <Button onClick={() => setFiltersB({})}>Clear</Button>
                    </Box>
                    <Divider />
                    <FilterSidebar filters={filtersB} onFilterChange={setFiltersB} />
                </Box>
            </Drawer>
        </Box>
    );
};

// Helper to show active filters
const FilterSummary: React.FC<{ filters: SearchFilters }> = ({ filters }) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const active = Object.entries(filters).filter(([_key, v]) => {
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object' && v !== null && 'value' in v) return !!v.value;
        return !!v;
    });

    if (active.length === 0) return <Typography variant="caption" color="textSecondary">All Data (No Filters)</Typography>;

    return (
        <Box display="flex" gap={1} flexWrap="wrap">
            {active.map(([k, v]) => (
                <Paper key={k} variant="outlined" sx={{ px: 1, py: 0.5, bgcolor: 'background.paper' }}>
                    <Typography variant="caption">
                        {k}: {JSON.stringify(v).replace(/"/g, '').replace(/value:/g, '')}
                    </Typography>
                </Paper>
            ))}
        </Box>
    );
};

export default SegmentComparison;
