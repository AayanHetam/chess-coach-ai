import CourseLibrary from "@/components/CourseLibrary";
import { PageTitle } from "@/components/pageTitle";
import { ThemeProvider } from "@mui/material/styles";
import { Box } from "@mui/material";
import Head from "next/head";
import { chessMastiDarkTheme } from "@/theme/chessMasti";
import { GradientBackdrop } from "@/components/ui/GradientBackdrop";
import { NavPill } from "@/components/ui/NavPill";

export default function Courses() {
  return (
    <ThemeProvider theme={chessMastiDarkTheme}>
      <PageTitle title="Chess Masti AI - Course Library" />
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#08090C" />
        <style>{`html,body{background-color:#08090C;color-scheme:dark;margin:0;}::-webkit-scrollbar{width:10px;height:10px;}::-webkit-scrollbar-track{background:#08090C;}::-webkit-scrollbar-thumb{background:rgba(249,115,22,0.18);border-radius:5px;}`}</style>
      </Head>

      <GradientBackdrop />

      <Box
        sx={{
          minHeight: "100vh",
          color: "rgba(255,255,255,0.94)",
          pt: 2,
          pb: 4,
          px: { xs: 2, md: 3 },
        }}
      >
        <NavPill />

        <Box sx={{ width: "100%", maxWidth: 1280, mx: "auto", mt: 2 }}>
          <CourseLibrary />
        </Box>
      </Box>
    </ThemeProvider>
  );
}
