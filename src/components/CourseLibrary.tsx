import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import {
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Button,
  Box,
  Stack,
  Chip,
  LinearProgress,
  Alert,
  Skeleton,
} from "@mui/material";
import { useRouter } from "next/router";
import {
  GraduationCap,
  Clock,
  Swords,
  BookOpen,
  Scale,
  Flag,
  Brain,
  Crown,
} from "lucide-react";
import { Course } from "@/app/api/courses/route";

interface CourseCardProps {
  course: Course;
  onStartCourse: (courseId: string) => void;
}

function CourseCard({ course, onStartCourse }: CourseCardProps) {
  const getDifficultyColor = (difficulty: Course['difficulty']) => {
    switch (difficulty) {
      case 'beginner': return 'success';
      case 'intermediate': return 'warning';
      case 'advanced': return 'info';
      case 'expert': return 'error';
      default: return 'default';
    }
  };

  const getCategoryIcon = (category: Course['category']): ReactNode => {
    const iconProps = { size: 40, color: '#FB923C', opacity: 0.9 };
    switch (category) {
      case 'tactics': return <Swords {...iconProps} />;
      case 'openings': return <BookOpen {...iconProps} />;
      case 'middlegame': return <Scale {...iconProps} />;
      case 'endgame': return <Flag {...iconProps} />;
      case 'strategy': return <Brain {...iconProps} />;
      default: return <Crown {...iconProps} />;
    }
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '1.5rem',
        background: 'rgba(20,22,28,0.55)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
        transition: 'all 180ms ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          borderColor: 'rgba(249,115,22,0.35)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(249,115,22,0.18), inset 0 1px 0 rgba(255,255,255,0.06)',
        }
      }}
    >
      <CardMedia
        sx={{
          height: 140,
          background: 'linear-gradient(135deg, rgba(249,115,22,0.08), rgba(20,22,28,0.6))',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {getCategoryIcon(course.category)}
      </CardMedia>
      
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography
          gutterBottom
          variant="h5"
          component="div"
          sx={{
            fontWeight: 700,
            color: 'rgba(255,255,255,0.94)',
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
          }}
        >
          {course.title}
        </Typography>

        <Typography
          variant="body2"
          sx={{ mb: 2, flexGrow: 1, color: 'rgba(255,255,255,0.62)', lineHeight: 1.55 }}
        >
          {course.description}
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Chip
            label={course.difficulty.toUpperCase()}
            color={getDifficultyColor(course.difficulty)}
            size="small"
            sx={{
              mr: 1,
              borderRadius: '999px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              fontSize: '0.66rem',
            }}
          />
          <Chip
            label={course.category.toUpperCase()}
            size="small"
            sx={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.72)',
              borderRadius: '999px',
              fontWeight: 700,
              letterSpacing: '0.04em',
              fontSize: '0.66rem',
            }}
          />
        </Box>

        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
          <Clock size={14} color="rgba(255,255,255,0.5)" style={{ verticalAlign: 'middle', marginRight: 4 }} />
          <Typography variant="body2" component="span" sx={{ color: 'rgba(255,255,255,0.62)' }}>
            <Box component="span" sx={{ fontFamily: 'Monaco, monospace', color: 'rgba(255,255,255,0.94)' }}>{course.estimatedTime}</Box> minutes • <Box component="span" sx={{ fontFamily: 'Monaco, monospace', color: 'rgba(255,255,255,0.94)' }}>{course.puzzles.length}</Box> puzzles
          </Typography>
        </Stack>

        <Typography variant="body2" sx={{ mb: 2, color: 'rgba(255,255,255,0.72)' }}>
          <Box
            component="span"
            sx={{
              display: 'block',
              color: 'rgba(255,255,255,0.5)',
              fontWeight: 700,
              fontSize: '0.7rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              mb: 0.5,
            }}
          >
            Concepts:
          </Box>
          {course.concepts.join(', ')}
        </Typography>

        {course.prerequisites && course.prerequisites.length > 0 && (
          <Typography variant="caption" sx={{ mb: 2, color: 'rgba(255,255,255,0.5)' }}>
            <Box
              component="span"
              sx={{
                display: 'block',
                color: 'rgba(255,255,255,0.5)',
                fontWeight: 700,
                fontSize: '0.7rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                mb: 0.5,
              }}
            >
              Prerequisites:
            </Box>
            {course.prerequisites.join(', ')}
          </Typography>
        )}

        <Button
          variant="contained"
          fullWidth
          onClick={() => onStartCourse(course.id)}
          sx={{
            mt: 'auto',
            bgcolor: '#F97316',
            color: '#0A0A0A',
            fontWeight: 700,
            borderRadius: '12px',
            textTransform: 'none',
            py: 1,
            boxShadow: '0 6px 18px rgba(249,115,22,0.32)',
            transition: 'all 180ms ease',
            '&:hover': {
              bgcolor: '#FB923C',
              boxShadow: '0 8px 22px rgba(249,115,22,0.42)',
            },
          }}
        >
          Start Course
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CourseLibrary() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const response = await fetch('/api/courses');
        const data = await response.json();
        
        if (data.success) {
          setCourses(data.courses);
        } else {
          setError(data.error || 'Failed to load courses');
        }
      } catch (err) {
        setError('Network error. Please try again.');
        console.error('Error fetching courses:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, []);

  const handleStartCourse = (courseId: string) => {
    router.push(`/practice?course=${courseId}`);
  };

  if (loading) {
    const glassCardSx = {
      borderRadius: '1.5rem',
      background: 'rgba(20,22,28,0.55)',
      backdropFilter: 'blur(14px) saturate(140%)',
      WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      border: '1px solid rgba(255,255,255,0.08)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
      overflow: 'hidden',
    };
    const skeletonSx = { bgcolor: 'rgba(255,255,255,0.06)' };
    return (
      <>
        <Grid container spacing={3}>
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item}>
              <Card sx={glassCardSx}>
                <CardContent>
                  <Skeleton variant="text" height={40} sx={skeletonSx} />
                  <Skeleton variant="text" height={20} sx={{ mt: 1, ...skeletonSx }} />
                  <Skeleton variant="rectangular" height={100} sx={{ mt: 2, ...skeletonSx }} />
                  <Skeleton variant="text" height={30} sx={{ mt: 2, ...skeletonSx }} />
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Alert
          severity="error"
          sx={{
            mb: 3,
            borderRadius: '1rem',
            background: 'rgba(20,22,28,0.55)',
            backdropFilter: 'blur(14px) saturate(140%)',
            WebkitBackdropFilter: 'blur(14px) saturate(140%)',
            border: '1px solid rgba(239,68,68,0.35)',
            color: 'rgba(255,255,255,0.94)',
            '& .MuiAlert-icon': { color: '#F87171' },
          }}
        >
          {error}
        </Alert>
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Button
            variant="contained"
            onClick={() => window.location.reload()}
            sx={{
              bgcolor: '#F97316',
              color: '#0A0A0A',
              fontWeight: 700,
              borderRadius: '12px',
              textTransform: 'none',
              py: 1,
              px: 3,
              boxShadow: '0 6px 18px rgba(249,115,22,0.32)',
              transition: 'all 180ms ease',
              '&:hover': {
                bgcolor: '#FB923C',
                boxShadow: '0 8px 22px rgba(249,115,22,0.42)',
              },
            }}
          >
            Try Again
          </Button>
        </Box>
      </>
    );
  }

  return (
    <>
      <Box sx={{ mb: 4 }}>
        <Typography
          sx={{
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontSize: '0.72rem',
            color: 'rgba(255,255,255,0.5)',
            mb: 1,
          }}
        >
          Course Library
        </Typography>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <GraduationCap size={26} color="#FB923C" />
          <Typography
            variant="h4"
            sx={{
              fontWeight: 800,
              color: 'rgba(255,255,255,0.94)',
              letterSpacing: '-0.01em',
            }}
          >
            Chess Learning Courses
          </Typography>
        </Stack>
        <Typography
          variant="body1"
          sx={{ color: 'rgba(255,255,255,0.62)', maxWidth: 620, lineHeight: 1.55, mt: 1 }}
        >
          Choose a course to improve specific chess skills. Each course contains 50 curated puzzles
          focused on particular concepts and difficulty levels.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {courses.map((course, index) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={course.id}>
            <CourseCard course={course} onStartCourse={handleStartCourse} />
          </Grid>
        ))}
      </Grid>
    </>
  );
}
