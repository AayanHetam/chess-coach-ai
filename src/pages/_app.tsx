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
import { Analytics } from "@vercel/analytics/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import QuizPersistenceFlush from "@/components/auth/QuizPersistenceFlush";
import OnboardingGate from "@/components/auth/OnboardingGate";
import ServiceWorkerRegistrar from "@/components/pwa/ServiceWorkerRegistrar";

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
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#F97316" />
        <title>Chess Masti AI - Make Chess Fun with AI-Powered Coaching!</title>
      </Head>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* Persists pre-auth onboarding-quiz answers once the user signs in,
              by either method (email in-page or Google full-page redirect). */}
          <QuizPersistenceFlush />
          {/* Sends any new signed-in user without a completed quiz straight to
              the onboarding questionnaire (mandatory once). */}
          <OnboardingGate />
          {/* Registers the push service worker (no-op where unsupported). */}
          <ServiceWorkerRegistrar />
          <ErrorBoundary name="app">
            <Layout>
              <Component {...pageProps} />
            </Layout>
          </ErrorBoundary>
        </AuthProvider>
      </QueryClientProvider>
      <Analytics />
    </>
  );
}
