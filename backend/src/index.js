const express = require('express');
const cors = require('cors');
const path = require('path');
const {
  DEFAULT_BODY_LIMIT,
  createAuthRateLimiter,
  createCorsOptions,
  createHelmetMiddleware,
  jsonErrorHandler,
  permissionsPolicy,
  preventResponseCaching
} = require('./middleware/httpSecurity');
const { validateBody, validateIdParam } = require('./middleware/validateRequest');
const { idempotency } = require('./middleware/idempotency');
const {
  authenticateToken,
  csrfProtection,
  optionalAuthentication,
  requireRole
} = require('./middleware/auth');
const setupSwagger = require('./swagger');

// Import controllers
const authController = require('./controllers/authController');
const studentController = require('./controllers/studentController');
const workoutController = require('./controllers/workoutController');
const chatController = require('./controllers/chatController');
const exerciseController = require('./controllers/exerciseController');
const auditController = require('./controllers/auditController');
const profileController = require('./controllers/profileController');
const workoutSessionController = require('./controllers/workoutSessionController');
const progressionController = require('./controllers/progressionController');
const adherenceController = require('./controllers/adherenceController');
const assessmentController = require('./controllers/assessmentController');
const healthController = require('./controllers/healthController');

// Initialize database
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const registrationRateLimiter = createAuthRateLimiter({ identifier: 'registration' });
const loginRateLimiter = createAuthRateLimiter({ identifier: 'login' });
const passwordChangeRateLimiter = createAuthRateLimiter({ identifier: 'profile-password' });
const forgotPasswordRateLimiter = createAuthRateLimiter({ identifier: 'forgot-password' });
const resetPasswordRateLimiter = createAuthRateLimiter({ identifier: 'reset-password' });

// Middleware
// The app is private on the Compose network and receives requests from exactly
// one trusted proxy: Nginx. Nginx replaces the forwarding chain with one
// authoritative client address before proxying the request.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.disable('etag');
app.use(createHelmetMiddleware());
app.use(permissionsPolicy);
app.use(preventResponseCaching);
app.use(cors(createCorsOptions()));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || DEFAULT_BODY_LIMIT }));
app.use(optionalAuthentication);
app.use(csrfProtection);

// Setup Swagger UI API documentation
setupSwagger(app, {
  environment: process.env.NODE_ENV,
  enabled: process.env.API_DOCS_ENABLED
});

// Liveness is independent from SQLite; readiness verifies the connection and
// confirms that no migrations are waiting to be applied.
app.get('/health/live', healthController.live);
app.get('/health/ready', healthController.ready);
// Backward-compatible alias used by existing Compose/probes.
app.get('/api/health', healthController.ready);

app.get('/api/subscription', authenticateToken, subscriptionController.getSubscription);
app.get('/api/team/members', authenticateToken, requireRole('personal'), teamController.listTeam);
app.post('/api/team/members', authenticateToken, requireRole('personal'), teamController.addTeamMember);
app.patch('/api/team/members/:id/end', authenticateToken, requireRole('personal'), validateIdParam('id'), teamController.terminateTeamMember);
app.post('/api/student/partner-consents', authenticateToken, partnerController.createConsent);
app.delete('/api/student/partner-consents/:id', authenticateToken, validateIdParam('id'), partnerController.revokeConsent);
app.get('/api/partner/students/:studentId/summary', authenticateToken, validateIdParam('studentId'), partnerController.getStudentSummary);
app.post('/api/wearables/connections', authenticateToken, wearableController.createConnection);
app.get('/api/wearables/connections', authenticateToken, wearableController.listConnections);
app.delete('/api/wearables/connections/:id', authenticateToken, validateIdParam('id'), wearableController.revokeConnection);
app.post('/api/wearables/connections/:id/metrics', authenticateToken, validateIdParam('id'), wearableController.ingestMetrics);
app.get('/api/wearables/metrics', authenticateToken, wearableController.listMetrics);
app.post('/api/crm/run-daily', authenticateToken, crmController.runDaily);
app.get('/api/crm/alerts', authenticateToken, crmController.listAlerts);
app.patch('/api/crm/alerts/:id/resolve', authenticateToken, validateIdParam('id'), crmController.resolveAlert);
app.get('/api/crm/nps', authenticateToken, crmController.listNps);
app.get('/api/student/nps', authenticateToken, crmController.listStudentNps);
app.post('/api/student/nps/:id/respond', authenticateToken, validateIdParam('id'), crmController.respondNps);
app.post('/api/personal/geofences', authenticateToken, geofenceController.createGeofence);
app.get('/api/personal/geofences', authenticateToken, geofenceController.listGeofences);
app.get('/api/personal/checkins', authenticateToken, geofenceController.listCheckins);
app.post('/api/student/checkins', authenticateToken, geofenceController.checkIn);
app.post('/api/student/checkins/:id/checkout', authenticateToken, validateIdParam('id'), geofenceController.checkOut);
app.post('/api/student/readiness', authenticateToken, readinessController.save);
app.get('/api/student/readiness', authenticateToken, readinessController.listStudent);
app.get('/api/student/readiness/recommendation', authenticateToken, readinessController.getRecommendation);
app.get('/api/personal/students/:id/readiness', authenticateToken, validateIdParam('id'), readinessController.listForPersonal);
app.get('/api/notifications/preferences', authenticateToken, notificationController.getPreferences);
app.put('/api/notifications/preferences', authenticateToken, notificationController.putPreferences);
app.get('/api/notifications', authenticateToken, notificationController.listNotifications);
app.patch('/api/notifications/:id/read', authenticateToken, validateIdParam('id'), notificationController.markRead);
app.get('/api/compliance/export', authenticateToken, complianceController.exportData);
app.post('/api/compliance/delete', authenticateToken, complianceController.anonymizeAccount);
app.get('/api/sessions', authenticateToken, sessionController.listSessions);
app.delete('/api/sessions/:id', authenticateToken, sessionController.revokeSession);

app.patch('/api/profile', authenticateToken, validateBody('profileName'), profileController.updateName);
app.put('/api/profile/password', passwordChangeRateLimiter, authenticateToken, validateBody('profilePassword'), profileController.updatePassword);
app.post('/api/profile/waivers', authenticateToken, validateBody('waiver'), profileController.signWaiver);
app.put('/api/profile/avatar', authenticateToken, validateBody('profileAvatar'), profileController.updateAvatar);
app.delete('/api/profile/avatar', authenticateToken, profileController.deleteAvatar);
app.get('/api/profile/avatar/:userId', authenticateToken, validateIdParam('userId'), profileController.getAvatar);


// --- API ROUTES ---

// Autenticação

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Registra um novo Personal Trainer
 *     description: Cria uma nova conta de Personal Trainer. Requer uma chave de acesso válida, não utilizada e armazenada com hash no banco.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - accessKey
 *             properties:
 *               name:
 *                 type: string
 *                 example: João Personal
 *               email:
 *                 type: string
 *                 format: email
 *                 example: personal@fitlife.com
 *               password:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 128
 *                 example: SenhaSegura123
 *               accessKey:
 *                 type: string
 *                 example: key2
 *     responses:
 *       201:
 *         description: Personal Trainer cadastrado com sucesso.
 *       400:
 *         description: E-mail já cadastrado ou campos obrigatórios ausentes.
 *       403:
 *         description: Chave de acesso (accessKey) inválida ou já utilizada.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/auth/register', registrationRateLimiter, validateBody('register'), authController.registerPersonal);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Realiza o login de um usuário (Personal ou Aluno)
 *     description: Autentica o usuário e cria uma sessão em cookie HttpOnly acompanhada de proteção CSRF.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: personal@fitlife.com
 *               password:
 *                 type: string
 *                 example: senha123
 *     responses:
 *       200:
 *         description: Login bem-sucedido.
 *       400:
 *         description: E-mail ou senha inválidos, ou campos ausentes.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/auth/login', loginRateLimiter, validateBody('login'), authController.login);

app.post('/api/auth/logout', authenticateToken, authController.logout);

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     summary: Solicita instruções para redefinição de senha
 *     description: Gera um token seguro de redefinição de senha com expiração. Retorna resposta genérica para evitar enumeração de contas.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: personal@fitlife.com
 *     responses:
 *       200:
 *         description: Instruções geradas com sucesso (ou e-mail não encontrado de forma genérica).
 *       400:
 *         description: Formato de e-mail inválido.
 *       429:
 *         description: Limite de solicitações excedido.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/auth/forgot-password', forgotPasswordRateLimiter, validateBody('forgotPassword'), authController.forgotPassword);

/**
 * @openapi
 * /auth/reset-password:
 *   post:
 *     summary: Redefine a senha utilizando um token de redefinição
 *     description: Valida o token de redefinição, atualiza a senha da conta, incrementa a versão de sessão e invalida o token usado.
 *     tags:
 *       - Autenticação
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *             properties:
 *               token:
 *                 type: string
 *                 example: a1b2c3d4e5f6...
 *               newPassword:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 128
 *                 example: NovaSenhaSegura123
 *     responses:
 *       200:
 *         description: Senha redefinida com sucesso.
 *       400:
 *         description: Token inválido, expirado ou nova senha fora do padrão.
 *       429:
 *         description: Limite de solicitações excedido.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/auth/reset-password', resetPasswordRateLimiter, validateBody('resetPasswordToken'), authController.resetPasswordWithToken);
app.post('/api/auth/verify-email', resetPasswordRateLimiter, validateBody('verifyEmail'), authController.verifyEmail);
app.post('/api/auth/student-invitations/claim', resetPasswordRateLimiter, validateBody('studentInviteClaim'), studentController.claimStudentInvitation);

/**
 * @openapi
 * /audit-logs:
 *   get:
 *     summary: Lista as ações de auditoria do usuário autenticado
 *     tags: [Auditoria]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Até 100 registros mais recentes, sem valores sensíveis.
 *       401:
 *         description: Sessão obrigatória.
 */
app.get('/api/audit-logs', authenticateToken, auditController.getOwnAuditLogs);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Obtém os dados do usuário autenticado atual
 *     description: Retorna as informações do usuário associado à sessão por cookie ou a um token Bearer de cliente não-browser.
 *     tags:
 *       - Autenticação
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dados do usuário autenticado.
 *       401:
 *         description: Token não fornecido ou inválido.
 *       404:
 *         description: Usuário não encontrado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.get('/api/auth/me', authenticateToken, authController.getMe);


// Alunos (Personal)

/**
 * @openapi
 * /personal/students:
 *   post:
 *     summary: Cadastra um novo Aluno (Apenas Personal Trainer)
 *     description: Cria uma conta de usuário com perfil de aluno vinculada ao Personal Trainer logado.
 *     tags:
 *       - Alunos
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Maria Aluna
 *               email:
 *                 type: string
 *                 format: email
 *                 example: maria@aluna.com
 *               password:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 128
 *                 example: SenhaAluno123
 *               height:
 *                 type: number
 *                 format: float
 *                 example: 1.68
 *               targetWeight:
 *                 type: number
 *                 format: float
 *                 example: 60.5
 *               birthDate:
 *                 type: string
 *                 format: date
 *                 example: 1995-10-15
 *     responses:
 *       201:
 *         description: Aluno cadastrado com sucesso.
 *       400:
 *         description: E-mail já cadastrado ou dados inválidos.
 *       403:
 *         description: Acesso negado. Apenas personal trainers podem criar contas de alunos.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/personal/students', authenticateToken, requireRole('personal'), validateBody('student'), studentController.createStudent);
app.post('/api/personal/students/invite', authenticateToken, requireRole('personal'), validateBody('studentInvite'), studentController.inviteStudent);

/**
 * @openapi
 * /personal/students:
 *   get:
 *     summary: Lista todos os alunos vinculados ao Personal Trainer logado
 *     description: Retorna a lista de alunos do personal autenticado, incluindo última pesagem e contagem de mensagens não lidas.
 *     tags:
 *       - Alunos
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de alunos retornada com sucesso.
 *       500:
 *         description: Erro interno do servidor.
 */
app.get('/api/personal/students', authenticateToken, requireRole('personal'), studentController.getStudents);
app.get('/api/personal/analytics/adherence', authenticateToken, requireRole('personal'), adherenceController.getAdherence);
app.get('/api/personal/students/:id/assessments', authenticateToken, validateIdParam('id'), assessmentController.listAssessments);
app.post('/api/personal/students/:id/assessments', authenticateToken, requireRole('personal'), validateIdParam('id'), validateBody('assessment'), assessmentController.createAssessment);
app.get('/api/personal/students/adherence', authenticateToken, adherenceController.getAdherence);

/**
 * @openapi
 * /personal/students/{id}:
 *   get:
 *     summary: Obtém os detalhes completos de um aluno específico
 *     description: Retorna as informações cadastrais, histórico de medidas e treinos do aluno especificado. Apenas o próprio aluno ou seu personal podem acessar.
 *     tags:
 *       - Alunos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do aluno
 *     responses:
 *       200:
 *         description: Detalhes do aluno retornados com sucesso.
 *       403:
 *         description: Acesso negado (aluno não vinculado ou sem privilégios).
 *       404:
 *         description: Aluno não encontrado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.get('/api/personal/students/:id', authenticateToken, studentController.getStudentDetails);
app.patch('/api/personal/students/:id/status', authenticateToken, requireRole('personal'), validateIdParam('id'), validateBody('studentLifecycle'), studentController.updateStudentLifecycle);

/**
 * @openapi
 * /personal/students/{id}/reset-password:
 *   post:
 *     summary: Redefine a senha de um aluno (Apenas Personal Trainer)
 *     description: Permite que o Personal Trainer redefina a senha de acesso de um dos seus alunos vinculados.
 *     tags:
 *       - Alunos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do aluno
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 128
 *                 example: novasenhasegura123
 *     responses:
 *       200:
 *         description: Senha redefinida com sucesso.
 *       400:
 *         description: Senha ausente ou com menos de 10 caracteres.
 *       403:
 *         description: Acesso negado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/personal/students/:id/reset-password', authenticateToken, requireRole('personal'), validateIdParam('id'), validateBody('passwordReset'), studentController.resetPassword);


// Medidas (Aluno/Personal)

/**
 * @openapi
 * /student/measurements:
 *   post:
 *     summary: Adiciona novas medições corporais (Aluno ou Personal)
 *     description: Salva um registro das medidas corporais do aluno. Alunos registram para si próprios. Personals registram informando o `studentId`.
 *     tags:
 *       - Medidas
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - weight
 *             properties:
 *               studentId:
 *                 type: integer
 *                 description: ID do aluno (Obrigatório se enviado pelo Personal Trainer)
 *                 example: 3
 *               weight:
 *                 type: number
 *                 format: float
 *                 description: Peso corporal em kg
 *                 example: 72.4
 *               chest:
 *                 type: number
 *                 format: float
 *                 example: 95.0
 *               waist:
 *                 type: number
 *                 format: float
 *                 example: 80.0
 *               hips:
 *                 type: number
 *                 format: float
 *                 example: 98.0
 *               bicepsL:
 *                 type: number
 *                 format: float
 *                 example: 33.5
 *               bicepsR:
 *                 type: number
 *                 format: float
 *                 example: 34.0
 *               thighL:
 *                 type: number
 *                 format: float
 *                 example: 54.0
 *               thighR:
 *                 type: number
 *                 format: float
 *                 example: 54.5
 *     responses:
 *       201:
 *         description: Medidas corporais registradas com sucesso.
 *       400:
 *         description: Peso ou ID do aluno ausentes.
 *       403:
 *         description: Acesso negado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/student/measurements', authenticateToken, validateBody('measurement'), studentController.addMeasurement);

/**
 * @openapi
 * /student/measurements:
 *   get:
 *     summary: Obtém o histórico de medições corporais
 *     description: Retorna todas as medições corporais registradas para o aluno logado ou, se for o personal, para o ID especificado.
 *     tags:
 *       - Medidas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         required: false
 *         schema:
 *           type: integer
 *         description: ID do aluno (Obrigatório apenas quando acessado por um Personal Trainer)
 *     responses:
 *       200:
 *         description: Histórico de medidas retornado com sucesso.
 *       400:
 *         description: ID do aluno não informado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.get('/api/student/measurements', authenticateToken, studentController.getMeasurements);


// Treinos (Personal/Aluno)

/**
 * @openapi
 * /workouts:
 *   post:
 *     summary: Cria um novo treino para um aluno (Apenas Personal Trainer)
 *     description: Cria uma ficha de treino (ex. "Treino A - Hipertrofia") vinculada a um aluno.
 *     tags:
 *       - Treinos
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - studentId
 *               - name
 *             properties:
 *               studentId:
 *                 type: integer
 *                 example: 3
 *               name:
 *                 type: string
 *                 example: Treino A - Peito e Tríceps
 *     responses:
 *       201:
 *         description: Treino criado com sucesso.
 *       400:
 *         description: ID do aluno ou nome do treino ausentes.
 *       403:
 *         description: Acesso negado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/workouts', authenticateToken, requireRole('personal'), validateBody('workout'), workoutController.createWorkout);

/**
 * @openapi
 * /workouts/{id}:
 *   delete:
 *     summary: Remove um treino (Apenas Personal Trainer)
 *     description: Exclui a ficha de treino especificada e remove todos os exercícios vinculados a ela.
 *     tags:
 *       - Treinos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do treino
 *     responses:
 *       200:
 *         description: Treino removido com sucesso.
 *       403:
 *         description: Acesso negado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.delete('/api/workouts/:id', authenticateToken, requireRole('personal'), validateIdParam('id'), workoutController.deleteWorkout);
app.patch('/api/workouts/:id/status', authenticateToken, requireRole('personal'), validateIdParam('id'), validateBody('workoutStatus'), workoutController.updateWorkoutStatus);
app.put('/api/workouts/:id/periodization', authenticateToken, requireRole('personal'), validateIdParam('id'), validateBody('periodization'), workoutController.replaceWorkoutPeriodization);
app.get('/api/workouts/:id/periodization', authenticateToken, validateIdParam('id'), workoutController.getWorkoutPeriodization);

/**
 * @openapi
 * /workouts/{id}/exercises:
 *   post:
 *     summary: Adiciona um exercício ao treino (Apenas Personal Trainer)
 *     description: Associa um exercício do catálogo a uma ficha de treino específica, detalhando séries, repetições, carga e tempo de descanso.
 *     tags:
 *       - Treinos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do treino
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - exerciseId
 *               - sets
 *               - reps
 *             properties:
 *               exerciseId:
 *                 type: integer
 *                 example: 1
 *               sets:
 *                 type: integer
 *                 example: 4
 *               reps:
 *                 type: string
 *                 example: 12
 *               weight:
 *                 type: string
 *                 example: 20kg
 *               rest:
 *                 type: string
 *                 example: 60s
 *     responses:
 *       201:
 *         description: Exercício adicionado ao treino com sucesso.
 *       403:
 *         description: Acesso negado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/workouts/:id/exercises', authenticateToken, requireRole('personal'), validateIdParam('id'), validateBody('workoutExercise'), workoutController.addExercise);

/**
 * @openapi
 * /exercises/{id}:
 *   delete:
 *     summary: Remove um exercício de uma ficha de treino (Apenas Personal Trainer)
 *     description: Desvincula o exercício da ficha de treino correspondente.
 *     tags:
 *       - Treinos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da associação do exercício no treino
 *     responses:
 *       200:
 *         description: Exercício removido do treino com sucesso.
 *       403:
 *         description: Acesso negado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.delete('/api/exercises/:id', authenticateToken, requireRole('personal'), validateIdParam('id'), workoutController.deleteExercise);

/**
 * @openapi
 * /student/workouts:
 *   get:
 *     summary: Obtém os treinos do aluno logado
 *     description: Retorna a lista completa de treinos e os respectivos exercícios associados para o aluno autenticado no momento.
 *     tags:
 *       - Treinos
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de treinos e exercícios retornada com sucesso.
 *       500:
 *         description: Erro interno do servidor.
 */
app.get('/api/student/workouts', authenticateToken, workoutController.getStudentWorkouts);
app.get('/api/student/progression', authenticateToken, progressionController.getProgression);

// Sessões Reais de Treino (BUS-01)

/**
 * @openapi
 * /workout-sessions/start:
 *   post:
 *     summary: Inicia uma sessão de treino real para uma ficha (Aluno/Personal)
 *     tags: [Sessões de Treino]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workoutId]
 *             properties:
 *               workoutId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Sessão de treino iniciada com sucesso.
 *       409:
 *         description: Já existe uma sessão em andamento.
 */
app.post('/api/workout-sessions/start', authenticateToken, idempotency, validateBody('startWorkoutSession'), workoutSessionController.startSession);

/**
 * @openapi
 * /workout-sessions/{id}/exercises/{exerciseId}:
 *   patch:
 *     summary: Atualiza o progresso de execução de um exercício em uma sessão ativa
 *     tags: [Sessões de Treino]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: exerciseId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Progresso do exercício atualizado.
 */

app.patch('/api/workout-sessions/:id/exercises/:exerciseId', authenticateToken, validateIdParam('id'), validateIdParam('exerciseId'), validateBody('updateWorkoutSessionExercise'), workoutSessionController.updateExerciseProgress);
app.patch('/api/workout-sessions/:id/activity', authenticateToken, validateIdParam('id'), workoutSessionController.keepSessionAlive);

/**
 * @openapi
 * /workout-sessions/{id}/complete:
 *   post:
 *     summary: Finaliza uma sessão de treino ativa
 *     tags: [Sessões de Treino]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Sessão de treino concluída.
 */
app.post('/api/workout-sessions/:id/complete', authenticateToken, idempotency, validateIdParam('id'), validateBody('completeWorkoutSession'), workoutSessionController.completeSession);

/**
 * @openapi
 * /workout-sessions/{id}/cancel:
 *   post:
 *     summary: Cancela uma sessão de treino em andamento
 *     tags: [Sessões de Treino]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Sessão cancelada.
 */
app.post('/api/workout-sessions/:id/cancel', authenticateToken, idempotency, validateIdParam('id'), workoutSessionController.cancelSession);

/**
 * @openapi
 * /workout-sessions:
 *   get:
 *     summary: Lista o histórico de sessões de treino
 *     tags: [Sessões de Treino]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: studentId
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [in_progress, completed, cancelled] }
 *     responses:
 *       200:
 *         description: Lista de sessões de treino retornada com sucesso.
 */
app.get('/api/workout-sessions', authenticateToken, workoutSessionController.getSessions);

/**
 * @openapi
 * /workout-sessions/{id}:
 *   get:
 *     summary: Obtém os detalhes completos de uma sessão de treino
 *     tags: [Sessões de Treino]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Detalhes da sessão de treino retornados.
 */
app.get('/api/workout-sessions/:id', authenticateToken, validateIdParam('id'), workoutSessionController.getSessionDetails);



// Catálogo de Exercícios (Personal/Aluno)

/**
 * @openapi
 * /catalog/exercises:
 *   get:
 *     summary: Lista todos os exercícios cadastrados no catálogo global
 *     description: Retorna a lista de todos os exercícios disponíveis para montagem de treinos, contendo nome, descrição técnica e URL do GIF de execução.
 *     tags:
 *       - Catálogo de Exercícios
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Catálogo retornado com sucesso.
 *       500:
 *         description: Erro interno do servidor.
 */
app.get('/api/catalog/exercises', authenticateToken, exerciseController.getExercises);
app.get('/api/catalog/governance', authenticateToken, requireRole('personal'), exerciseController.getCatalogGovernance);

/**
 * @openapi
 * /catalog/exercises:
 *   post:
 *     summary: Cadastra um novo exercício no catálogo global (Apenas Personal Trainer)
 *     description: Adiciona um novo exercício para ficar disponível para montagem de fichas.
 *     tags:
 *       - Catálogo de Exercícios
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Supino Reto com Barra
 *               gifUrl:
 *                 type: string
 *                 description: URL HTTPS (até 2048 caracteres) ou data URL Base64 de GIF, PNG, JPEG ou WebP (até 525000 caracteres).
 *                 example: https://exemplo.com/supino.gif
 *               description:
 *                 type: string
 *                 example: Deite-se no banco plano, retire a barra do suporte...
 *     responses:
 *       201:
 *         description: Exercício adicionado ao catálogo com sucesso.
 *       400:
 *         description: Nome do exercício ausente.
 *       403:
 *         description: Acesso negado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/catalog/exercises', authenticateToken, requireRole('personal'), validateBody('catalogExercise'), exerciseController.createExercise);
app.post('/api/catalog/governance/merge', authenticateToken, requireRole('personal'), validateBody('catalogMerge'), exerciseController.mergeCatalogExercises);

/**
 * @openapi
 * /catalog/exercises/{id}:
 *   delete:
 *     summary: Remove um exercício do catálogo global (Apenas Personal Trainer)
 *     description: Exclui o exercício do catálogo global.
 *     tags:
 *       - Catálogo de Exercícios
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do exercício no catálogo
 *     responses:
 *       200:
 *         description: Exercício removido do catálogo com sucesso.
 *       403:
 *         description: Acesso negado.
 *       500:
 *         description: Erro interno do servidor.
 */
app.delete('/api/catalog/exercises/:id', authenticateToken, requireRole('personal'), validateIdParam('id'), exerciseController.deleteExercise);
app.patch('/api/catalog/exercises/:id/favorite', authenticateToken, requireRole('personal'), validateIdParam('id'), exerciseController.toggleFavorite);
app.put('/api/catalog/exercises/reorder', authenticateToken, requireRole('personal'), exerciseController.reorderExercises);


// Chat (Tempo Real com SSE)

/**
 * @openapi
 * /chat/stream:
 *   get:
 *     summary: Abre uma conexão de Server-Sent Events (SSE) para o chat em tempo real
 *     description: Mantém uma conexão aberta para envio de novas mensagens em tempo real.
 *     tags:
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conexão SSE estabelecida com sucesso.
 *       500:
 *         description: Erro interno do servidor.
 */
app.get('/api/chat/stream', authenticateToken, chatController.handleChatStream);
app.get('/api/chat/partner', authenticateToken, chatController.getChatPartner);

/**
 * @openapi
 * /chat/{userId}:
 *   get:
 *     summary: Carrega o histórico de mensagens ou lista de conversas
 *     description: Se userId for passado, retorna o histórico com aquele usuário. Se não, retorna a lista de conversas ativas.
 *     tags:
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: false
 *         schema:
 *           type: integer
 *         description: ID do usuário na conversa
 *     responses:
 *       200:
 *         description: Histórico ou lista de conversas.
 *       403:
 *         description: Usuário sem permissão para acessar esta conversa.
 *       500:
 *         description: Erro interno do servidor.
 */
app.get('/api/chat/:userId?', authenticateToken, chatController.getMessages);

/**
 * @openapi
 * /chat:
 *   post:
 *     summary: Envia uma nova mensagem no chat
 *     description: Envia uma mensagem para outro usuário.
 *     tags:
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - receiverId
 *               - message
 *             properties:
 *               receiverId:
 *                 type: integer
 *                 example: 3
 *               message:
 *                 type: string
 *                 example: Olá! Fiz os treinos de hoje.
 *     responses:
 *       201:
 *         description: Mensagem enviada com sucesso.
 *       400:
 *         description: Destinatário ou mensagem ausentes.
 *       403:
 *         description: Usuário sem permissão para enviar mensagem ao destinatário.
 *       500:
 *         description: Erro interno do servidor.
 */
app.post('/api/chat', authenticateToken, validateBody('chatMessage'), chatController.sendMessage);
app.post('/api/chat/typing', authenticateToken, chatController.sendTyping);

// Normalize parser failures without exposing Express internals.
app.use(jsonErrorHandler);

// Removed fallback to SPA index.html, handled by Nginx now

// Start Server
if (require.main === module) {
  db.ready
    .then(() => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`=========================================`);
        console.log(`  FITLIFE SYNC SERVER RUNNING`);
        console.log(`  Local:   http://localhost:${PORT}`);
        console.log(`  Environment: ${process.env.NODE_ENV || 'production'}`);
        console.log(`=========================================`);
      });
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

module.exports = app;
