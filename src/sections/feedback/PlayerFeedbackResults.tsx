import {
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Divider,
  Alert,
  Stack,
  IconButton,
  Tooltip,
} from "@mui/material";
import { ExpandMore, TrendingUp, TrendingDown, Psychology, School, Chat, Launch } from "@mui/icons-material";
import { PlayerFeedbackData, GameViolation } from "@/types/feedback";

interface Props {
  data: PlayerFeedbackData;
  onReset: () => void;
  onAnalyzeWithAI?: (message: string, pgn?: string) => void;
}

export default function PlayerFeedbackResults({ data, onReset, onAnalyzeWithAI }: Props) {
  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString();
  };

  const handleReset = () => {
    try {
      if (typeof onReset === 'function') {
        onReset();
      } else {
        console.error('onReset is not a function:', onReset);
        // Fallback: reload the page
        window.location.reload();
      }
    } catch (error) {
      console.error('Error in handleReset:', error);
      // Fallback: reload the page
      window.location.reload();
    }
  };

  const handleAnalyzeWithAI = (gameViolation: GameViolation) => {
    if (onAnalyzeWithAI) {
      onAnalyzeWithAI(gameViolation.analysisMessage, gameViolation.pgn);
    } else {
      // Fallback: navigate to analysis page with the game
      window.location.href = `/?pgn=${encodeURIComponent(gameViolation.pgn)}&message=${encodeURIComponent(gameViolation.analysisMessage)}`;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "major": return "error";
      case "moderate": return "warning";
      case "minor": return "info";
      default: return "default";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high": return "error";
      case "medium": return "warning";
      case "low": return "info";
      default: return "default";
    }
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 1200 }}>
      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h5">
              Feedback for {data.username} ({data.platform})
            </Typography>
            <Button 
              variant="outlined" 
              onClick={handleReset}
            >
              Analyze Another Player
            </Button>
          </Box>
          
          <Stack direction="row" spacing={2} flexWrap="wrap">
            <Box>
              <Typography variant="body2" color="text.secondary">Games Analyzed</Typography>
              <Typography variant="h6">{data.analyzedGames}/{data.totalGames}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Average Opponent Rating</Typography>
              <Typography variant="h6">{data.averageRating}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Principle Violations</Typography>
              <Typography variant="h6">{data.principleViolations.length}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Generated</Typography>
              <Typography variant="body2">{formatDate(data.generatedAt)}</Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Openings Analysis */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <School sx={{ mr: 1, verticalAlign: "middle" }} />
            Opening Analysis
          </Typography>
          
          {data.openings.length === 0 ? (
            <Alert severity="info">No opening data available</Alert>
          ) : (
            <Stack spacing={2}>
              {data.openings.slice(0, 5).map((opening, index) => (
                <Accordion key={index}>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Box display="flex" alignItems="center" gap={2} width="100%">
                      <Typography variant="subtitle1" fontWeight="bold">
                        {opening.name}
                      </Typography>
                      <Chip
                        label={`${opening.frequency} games`}
                        variant="outlined"
                        size="small"
                      />
                      <Chip
                        label={`${opening.winRate.toFixed(1)}% win rate`}
                        color={opening.winRate >= 50 ? "success" : "warning"}
                        size="small"
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box mb={2}>
                      <Typography variant="body2" color="text.secondary">
                        {opening.suggestions.length > 0 ? opening.suggestions[0] : "Study this opening to improve your play."}
                      </Typography>
                    </Box>
                    
                    <Typography variant="subtitle2" mb={1}>
                      Games played:
                    </Typography>
                    <List dense>
                      {opening.games.slice(0, 5).map((game, gameIndex) => (
                        <ListItem key={gameIndex} sx={{ border: '1px solid #e0e0e0', borderRadius: 1, mb: 1 }}>
                          <ListItemText
                            primary={
                              <Box display="flex" alignItems="center" gap={1}>
                                <Typography variant="body2" fontWeight="bold">
                                  vs {game.opponent}
                                </Typography>
                                <Chip
                                  label={game.result.toUpperCase()}
                                  color={game.result === "win" ? "success" : game.result === "loss" ? "error" : "default"}
                                  size="small"
                                />
                                <Typography variant="body2" color="text.secondary">
                                  {new Date(game.date).toLocaleDateString()}
                                </Typography>
                              </Box>
                            }
                            secondary={
                              <Box display="flex" alignItems="center" gap={1} mt={1}>
                                <Tooltip title="Analyze with AI Coach">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleAnalyzeWithAI(game)}
                                    color="primary"
                                  >
                                    <Chat fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Typography variant="body2" fontSize="0.8rem">
                                  {game.description}
                                </Typography>
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Principle Violations */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <TrendingDown sx={{ mr: 1, verticalAlign: "middle" }} />
            Common Principle Violations
          </Typography>
          
          {data.principleViolations.length === 0 ? (
            <Alert severity="success">Excellent! No significant principle violations found.</Alert>
          ) : (
            <Stack spacing={2}>
              {data.principleViolations.slice(0, 5).map((violation, index) => (
                <Accordion key={index}>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Box display="flex" alignItems="center" gap={2} width="100%">
                      <Typography variant="subtitle1" fontWeight="bold">
                        {violation.principle.name}
                      </Typography>
                      <Chip
                        label={violation.severity}
                        color={getSeverityColor(violation.severity)}
                        size="small"
                      />
                      <Chip
                        label={`${violation.frequency} violations`}
                        variant="outlined"
                        size="small"
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Box mb={2}>
                      <Typography variant="body2" color="text.secondary" mb={1}>
                        {violation.principle.description}
                      </Typography>
                      <Typography variant="body2" mb={1}>
                        <strong>Impact:</strong> {violation.impact}
                      </Typography>
                      <Typography variant="body2" mb={2}>
                        <strong>Improvement Tip:</strong> {violation.improvementTip}
                      </Typography>
                    </Box>
                    
                    <Typography variant="subtitle2" mb={1}>
                      Specific violations:
                    </Typography>
                    <List dense>
                      {violation.games.slice(0, 5).map((game, gameIndex) => (
                        <ListItem key={gameIndex} sx={{ border: '1px solid #e0e0e0', borderRadius: 1, mb: 1 }}>
                          <ListItemText
                            primary={
                              <Box display="flex" alignItems="center" gap={1}>
                                <Typography variant="body2" fontWeight="bold">
                                  vs {game.opponent}
                                </Typography>
                                <Chip
                                  label={game.result.toUpperCase()}
                                  color={game.result === "win" ? "success" : game.result === "loss" ? "error" : "default"}
                                  size="small"
                                />
                                {game.moveNumber > 0 && (
                                  <Chip
                                    label={`Move ${game.moveNumber}`}
                                    variant="outlined"
                                    size="small"
                                  />
                                )}
                                <Typography variant="body2" color="text.secondary">
                                  {new Date(game.date).toLocaleDateString()}
                                </Typography>
                              </Box>
                            }
                            secondary={
                              <Box display="flex" alignItems="center" gap={1} mt={1}>
                                <Tooltip title="Analyze with AI Coach">
                                  <IconButton
                                    size="small"
                                    onClick={() => handleAnalyzeWithAI(game)}
                                    color="primary"
                                  >
                                    <Chat fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Typography variant="body2" fontSize="0.8rem">
                                  {game.description}
                                </Typography>
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Improvement Areas */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <TrendingUp sx={{ mr: 1, verticalAlign: "middle" }} />
            Improvement Areas
          </Typography>
          
          {data.improvementAreas.length === 0 ? (
            <Alert severity="info">No specific improvement areas identified</Alert>
          ) : (
            <Stack spacing={2}>
              {data.improvementAreas.map((area, index) => (
                <Accordion key={index}>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Box display="flex" alignItems="center" gap={2} width="100%">
                      <Typography variant="subtitle1">
                        {area.title}
                      </Typography>
                      <Chip
                        label={area.priority}
                        color={getPriorityColor(area.priority)}
                        size="small"
                      />
                      <Chip
                        label={area.category}
                        variant="outlined"
                        size="small"
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                      {area.description}
                    </Typography>
                    
                    <Typography variant="subtitle2" mb={1}>
                      Recommended Exercises:
                    </Typography>
                    <List dense>
                      {area.exercises.map((exercise, idx) => (
                        <ListItem key={idx}>
                          <ListItemText
                            primary={exercise}
                            primaryTypographyProps={{ variant: "body2" }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Recent Games */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <Psychology sx={{ mr: 1, verticalAlign: "middle" }} />
            Recent Games Analysis
          </Typography>
          
          <Stack direction="row" spacing={2} flexWrap="wrap">
            {data.gameAnalysis.slice(0, 6).map((game, index) => (
              <Card variant="outlined" key={index} sx={{ minWidth: 200, flex: 1 }}>
                <CardContent>
                  <Typography variant="subtitle2" fontWeight="bold">
                    vs {game.opponent} ({game.opponentRating})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {typeof game.date === 'string' ? new Date(game.date).toLocaleDateString() : game.date.toLocaleDateString()}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1} mt={1}>
                    <Chip
                      label={game.result.toUpperCase()}
                      color={game.result === "win" ? "success" : game.result === "loss" ? "error" : "default"}
                      size="small"
                    />
                    <Chip
                      label={`${game.accuracy.toFixed(1)}% accuracy`}
                      variant="outlined"
                      size="small"
                    />
                  </Box>
                  <Typography variant="body2" mt={1}>
                    <strong>Opening:</strong> {game.opening}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Violations:</strong> {game.principleViolations.length}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
} 