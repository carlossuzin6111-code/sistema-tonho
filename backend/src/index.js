const express = require('express');
const cors = require('cors');
const path = require('path');
const { authenticateToken, requireRole } = require('./middleware/auth');

// Import controllers
const authController = require('./controllers/authController');
const studentController = require('./controllers/studentController');
const workoutController = require('./controllers/workoutController');
const chatController = require('./controllers/chatController');
const exerciseController = require('./controllers/exerciseController');

// Initialize database
require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());


// --- API ROUTES ---

// Autenticação
app.post('/api/auth/register', authController.registerPersonal);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/me', authenticateToken, authController.getMe);

// Alunos (Personal)
app.post('/api/personal/students', authenticateToken, requireRole('personal'), studentController.createStudent);
app.get('/api/personal/students', authenticateToken, requireRole('personal'), studentController.getStudents);
app.get('/api/personal/students/:id', authenticateToken, studentController.getStudentDetails);
app.post('/api/personal/students/:id/reset-password', authenticateToken, requireRole('personal'), studentController.resetPassword);

// Medidas (Aluno/Personal)
app.post('/api/student/measurements', authenticateToken, studentController.addMeasurement);
app.get('/api/student/measurements', authenticateToken, studentController.getMeasurements);

// Treinos (Personal/Aluno)
app.post('/api/workouts', authenticateToken, requireRole('personal'), workoutController.createWorkout);
app.delete('/api/workouts/:id', authenticateToken, requireRole('personal'), workoutController.deleteWorkout);
app.post('/api/workouts/:id/exercises', authenticateToken, requireRole('personal'), workoutController.addExercise);
app.delete('/api/exercises/:id', authenticateToken, requireRole('personal'), workoutController.deleteExercise);
app.get('/api/student/workouts', authenticateToken, workoutController.getStudentWorkouts);

// Catálogo de Exercícios (Personal/Aluno)
app.get('/api/catalog/exercises', authenticateToken, exerciseController.getExercises);
app.post('/api/catalog/exercises', authenticateToken, requireRole('personal'), exerciseController.createExercise);
app.delete('/api/catalog/exercises/:id', authenticateToken, requireRole('personal'), exerciseController.deleteExercise);

// Chat (Tempo Real com SSE)
app.get('/api/chat/stream', authenticateToken, chatController.handleChatStream);
app.get('/api/chat/:userId?', authenticateToken, chatController.getMessages);
app.post('/api/chat', authenticateToken, chatController.sendMessage);

// Removed fallback to SPA index.html, handled by Nginx now

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`  FITLIFE SYNC SERVER RUNNING`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`=========================================`);
});
