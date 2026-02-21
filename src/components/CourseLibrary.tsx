import { useState, useEffect } from "react";
import {
  Grid,
  Card,
  CardContent,
  CardMedia,
  Typography,
  Button,
  Box,
  Chip,
  LinearProgress,
  Alert,
  Skeleton,
} from "@mui/material";
import { useRouter } from "next/router";
import { Course } from "@/app/api/courses/route";
import { PageTitle } from "@/components/pageTitle";

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

  const getCategoryIcon = (category: Course['category']) => {
    switch (category) {
      case 'tactics': return '⚔️';
      case 'openings': return '📖';
      case 'middlegame': return '⚖️';
      case 'endgame': return '🏁';
      case 'strategy': return '🧠';
      default: return '♟️';
    }
  };

  return (
    <Card 
      sx={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4,
        }
      }}
    >
      <CardMedia
        sx={{
          height: 140,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '3rem',
        }}
      >
        {getCategoryIcon(course.category)}
      </CardMedia>
      
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <Typography gutterBottom variant="h5" component="div" fontWeight={600}>
          {course.title}
        </Typography>
        
        <Typography 
          variant="body2" 
          color="text.secondary" 
          sx={{ mb: 2, flexGrow: 1 }}
        >
          {course.description}
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Chip 
            label={course.difficulty.toUpperCase()} 
            color={getDifficultyColor(course.difficulty)}
            size="small"
            sx={{ mr: 1 }}
          />
          <Chip 
            label={course.category.toUpperCase()} 
            variant="outlined" 
            size="small"
          />
        </Box>

        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>⏱️ {course.estimatedTime} minutes</strong> • {course.puzzles.length} puzzles
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <strong>Concepts:</strong> {course.concepts.join(', ')}
        </Typography>

        {course.prerequisites && course.prerequisites.length > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2 }}>
            <strong>Prerequisites:</strong> {course.prerequisites.join(', ')}
          </Typography>
        )}

        <Button
          variant="contained"
          fullWidth
          onClick={() => onStartCourse(course.id)}
          sx={{ mt: 'auto' }}
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
    return (
      <>
        <PageTitle title="Chess Masti AI - Course Library" />
        <Grid container spacing={3}>
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item}>
              <Card>
                <CardContent>
                  <Skeleton variant="text" height={40} />
                  <Skeleton variant="text" height={20} sx={{ mt: 1 }} />
                  <Skeleton variant="rectangular" height={100} sx={{ mt: 2 }} />
                  <Skeleton variant="text" height={30} sx={{ mt: 2 }} />
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
        <PageTitle title="Chess Masti AI - Course Library" />
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </Box>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Chess Masti AI - Course Library" />
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom fontWeight={600}>
          🎓 Chess Learning Courses
        </Typography>
        <Typography variant="body1" color="text.secondary">
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
