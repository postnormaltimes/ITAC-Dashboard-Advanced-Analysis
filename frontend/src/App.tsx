import { ThemeProvider, createTheme, CssBaseline, Box } from '@mui/material';
import AdvancedDashboard from './components/advanced/AdvancedDashboard';

const theme = createTheme({
    typography: {
        fontFamily: 'Inter, sans-serif',
    },
    palette: {
        mode: 'light',
        primary: {
            main: '#2c3e50',
        },
        secondary: {
            main: '#3498db',
        },
        background: {
            default: '#f4f6f8',
            paper: '#ffffff',
        },
    },
});

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                <AdvancedDashboard />
            </Box>
        </ThemeProvider>
    );
}

export default App;
