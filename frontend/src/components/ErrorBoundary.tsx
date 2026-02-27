
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';

interface Props {
    children?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <Box sx={{ p: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: '#f5f5f5' }}>
                    <Paper elevation={3} sx={{ p: 4, maxWidth: 800 }}>
                        <Typography variant="h4" color="error" gutterBottom>
                            Something went wrong
                        </Typography>
                        <Typography variant="body1" gutterBottom>
                            {this.state.error && this.state.error.toString()}
                        </Typography>
                        <Box sx={{ mt: 2, mb: 2, maxHeight: 300, overflow: 'auto', bgcolor: '#eee', p: 2, borderRadius: 1 }}>
                            <pre style={{ margin: 0, fontSize: '0.875rem' }}>
                                {this.state.errorInfo?.componentStack}
                            </pre>
                        </Box>
                        <Button variant="contained" color="primary" onClick={() => window.location.reload()}>
                            Reload Page
                        </Button>
                    </Paper>
                </Box>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
