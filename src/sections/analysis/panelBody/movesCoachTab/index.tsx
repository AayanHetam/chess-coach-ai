import React from "react";
import {
  Grid,
  GridProps,
} from "@mui/material";
import MovesPanel from "../classificationTab/movesPanel";
import MovesClassificationsRecap from "../classificationTab/movesClassificationsRecap";

export default function MovesCoachTab(props: GridProps) {
  return (
    <Grid
      container
      justifyContent="center"
      alignItems="start"
      size={12}
      flexGrow={1}
      {...props}
      sx={
        props.hidden ? { display: "none" } : { overflow: "hidden", ...props.sx }
      }
    >
      <Grid
        container
        justifyContent="center"
        alignItems="start"
        size={12}
        flexGrow={1}
        sx={{ overflow: "hidden" }}
      >
        <MovesPanel />
        <MovesClassificationsRecap />
      </Grid>
    </Grid>
  );
}
