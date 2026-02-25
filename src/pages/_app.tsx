import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { AppProps } from "next/app";
import Layout from "@/sections/layout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { Typography, Box, Container } from "@mui/material";
import Head from "next/head";
import { Analytics } from "@vercel/analytics/next";

const queryClient = new QueryClient();

// Maintenance Mode Component
function MaintenancePage() {
  return (
    <Container maxWidth="sm" sx={{ textAlign: "center", mt: 8 }}>
      <Box sx={{ p: 4 }}>
        <img
          src="/android-chrome-192x192.png"
          width={96}
          height={96}
          alt="Chess Masti AI"
          style={{ marginBottom: "24px" }}
        />
        <Typography variant="h3" component="h1" gutterBottom color="primary">
          Chess Masti AI
        </Typography>
        <Typography variant="h5" gutterBottom>
          🔧 Under Maintenance
        </Typography>
        <Typography variant="body1" sx={{ mt: 2, mb: 4 }}>
          We're making some exciting improvements to bring you even better chess
          coaching! Please check back soon.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Thank you for your patience! 🎯♜
        </Typography>
      </Box>
    </Container>
  );
}

export default function MyApp({ Component, pageProps }: AppProps) {
  // Check if maintenance mode is enabled
  const isMaintenanceMode = process.env.NEXT_PUBLIC_MAINTENANCE_MODE === "true";

  if (isMaintenanceMode) {
    return <MaintenancePage />;
  }

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
        />
        <title>Chess Masti AI - Make Chess Fun with AI-Powered Coaching!</title>
      </Head>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </AuthProvider>
      </QueryClientProvider>
      <Analytics />
    </>
  );
}
