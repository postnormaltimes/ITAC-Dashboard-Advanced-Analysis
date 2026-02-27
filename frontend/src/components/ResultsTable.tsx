
import React from 'react';
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper
} from '@tanstack/react-table';
import type { PaginationState } from '@tanstack/react-table';
import {
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
    TablePagination,
    Typography,
    Box,
    Button
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import type { Recommendation } from '../types';

interface ResultsTableProps {
    data: Recommendation[];
    total: number;
    pagination: PaginationState;
    onPaginationChange: (pagination: PaginationState) => void;
    isLoading: boolean;
    onRowClick: (id: string) => void;
    onExport: () => void;
}

const columnHelper = createColumnHelper<Recommendation>();

const columns = [
    columnHelper.accessor('id', {
        header: 'ID',
        cell: info => info.getValue(),
    }),
    columnHelper.accessor('fy', {
        header: 'Year',
        cell: info => info.getValue(),
    }),
    columnHelper.accessor('arc', {
        header: 'ARC',
        cell: info => info.getValue(),
    }),
    columnHelper.accessor('description', {
        header: 'Description',
        cell: info => info.getValue(),
    }),
    columnHelper.accessor('yearly_savings', {
        header: 'Savings ($)',
        cell: info => info.getValue().toLocaleString(),
    }),
    columnHelper.accessor('implementation_cost', {
        header: 'Cost ($)',
        cell: info => info.getValue().toLocaleString(),
    }),
    columnHelper.accessor('payback', {
        header: 'Payback (yrs)',
        cell: info => info.getValue().toFixed(2),
    }),
    columnHelper.accessor('impstatus', {
        header: 'Status',
        cell: info => info.getValue(),
    }),
];

const ResultsTable: React.FC<ResultsTableProps> = ({
    data, total, pagination, onPaginationChange, isLoading, onRowClick, onExport
}) => {

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        manualPagination: true,
        pageCount: Math.ceil(total / pagination.pageSize),
        state: {
            pagination,
        },
        onPaginationChange: (updater) => {
            // Handle pagination state update correctly
            if (typeof updater === 'function') {
                onPaginationChange(updater(pagination));
            } else {
                onPaginationChange(updater);
            }
        }
    });

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" component="div">
                    Search Results ({total.toLocaleString()})
                </Typography>
                <Box>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={onExport}
                        disabled={isLoading || total === 0}
                    >
                        Export CSV
                    </Button>
                </Box>
            </Box>
            {isLoading && <Box p={2}>Loading...</Box>}
            <TableContainer sx={{ maxHeight: 640 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        {table.getHeaderGroups().map(headerGroup => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map(header => (
                                    <TableCell key={header.id}>
                                        {flexRender(
                                            header.column.columnDef.header,
                                            header.getContext()
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableHead>
                    <TableBody>
                        {table.getRowModel().rows.map(row => (
                            <TableRow
                                hover
                                key={row.id}
                                onClick={() => onRowClick(row.original.id)}
                                sx={{ cursor: 'pointer' }}
                            >
                                {row.getVisibleCells().map(cell => (
                                    <TableCell key={cell.id}>
                                        {flexRender(
                                            cell.column.columnDef.cell,
                                            cell.getContext()
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <TablePagination
                rowsPerPageOptions={[10, 20, 50, 100]}
                component="div"
                count={total}
                rowsPerPage={pagination.pageSize}
                page={pagination.pageIndex}
                onPageChange={(_, newPage) => onPaginationChange({ ...pagination, pageIndex: newPage })}
                onRowsPerPageChange={(e) => onPaginationChange({ ...pagination, pageSize: parseInt(e.target.value, 10), pageIndex: 0 })}
            />
        </Paper>
    );
};

export default ResultsTable;
