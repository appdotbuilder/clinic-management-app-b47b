import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  loginInputSchema,
  createUserInputSchema,
  updateUserInputSchema,
  createPatientInputSchema,
  updatePatientInputSchema,
  searchPatientInputSchema,
  createDoctorInputSchema,
  updateDoctorInputSchema,
  getDoctorPatientsInputSchema,
  createMedicalRecordInputSchema,
  updateMedicalRecordInputSchema,
  getPatientMedicalHistoryInputSchema,
  createPaymentInputSchema,
  getPaymentHistoryInputSchema
} from './schema';

// Import handlers
import { loginUser, validateToken } from './handlers/auth';
import { createUser, getUsers, getUserById, updateUser, deleteUser } from './handlers/users';
import { createPatient, getPatients, getPatientById, updatePatient, deletePatient, searchPatients } from './handlers/patients';
import { createDoctor, getDoctors, getDoctorById, updateDoctor, deleteDoctor, getDoctorPatients } from './handlers/doctors';
import { createMedicalRecord, getMedicalRecords, getMedicalRecordById, updateMedicalRecord, deleteMedicalRecord, getPatientMedicalHistory, getTodaysMedicalRecords } from './handlers/medical_records';
import { createPayment, getPayments, getPaymentById, getPaymentHistory, getPaymentReceipt, getPaymentStatistics } from './handlers/payments';
import { getDashboardStats, getRecentActivities, getTodaysSchedule } from './handlers/dashboard';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => loginUser(input)),
    validateToken: publicProcedure
      .input(z.string())
      .query(({ input }) => validateToken(input)),
  }),

  // User management routes (Admin only)
  users: router({
    create: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
    getAll: publicProcedure
      .query(() => getUsers()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getUserById(input)),
    update: publicProcedure
      .input(updateUserInputSchema)
      .mutation(({ input }) => updateUser(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteUser(input)),
  }),

  // Patient management routes
  patients: router({
    create: publicProcedure
      .input(createPatientInputSchema)
      .mutation(({ input }) => createPatient(input)),
    getAll: publicProcedure
      .query(() => getPatients()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getPatientById(input)),
    update: publicProcedure
      .input(updatePatientInputSchema)
      .mutation(({ input }) => updatePatient(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deletePatient(input)),
    search: publicProcedure
      .input(searchPatientInputSchema)
      .query(({ input }) => searchPatients(input)),
  }),

  // Doctor management routes
  doctors: router({
    create: publicProcedure
      .input(createDoctorInputSchema)
      .mutation(({ input }) => createDoctor(input)),
    getAll: publicProcedure
      .query(() => getDoctors()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getDoctorById(input)),
    update: publicProcedure
      .input(updateDoctorInputSchema)
      .mutation(({ input }) => updateDoctor(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteDoctor(input)),
    getPatients: publicProcedure
      .input(getDoctorPatientsInputSchema)
      .query(({ input }) => getDoctorPatients(input)),
  }),

  // Medical records routes
  medicalRecords: router({
    create: publicProcedure
      .input(createMedicalRecordInputSchema)
      .mutation(({ input }) => createMedicalRecord(input)),
    getAll: publicProcedure
      .query(() => getMedicalRecords()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getMedicalRecordById(input)),
    update: publicProcedure
      .input(updateMedicalRecordInputSchema)
      .mutation(({ input }) => updateMedicalRecord(input)),
    delete: publicProcedure
      .input(z.number())
      .mutation(({ input }) => deleteMedicalRecord(input)),
    getPatientHistory: publicProcedure
      .input(getPatientMedicalHistoryInputSchema)
      .query(({ input }) => getPatientMedicalHistory(input)),
    getTodaysRecords: publicProcedure
      .input(z.number())
      .query(({ input }) => getTodaysMedicalRecords(input)),
  }),

  // Payment management routes
  payments: router({
    create: publicProcedure
      .input(createPaymentInputSchema)
      .mutation(({ input }) => createPayment(input)),
    getAll: publicProcedure
      .query(() => getPayments()),
    getById: publicProcedure
      .input(z.number())
      .query(({ input }) => getPaymentById(input)),
    getHistory: publicProcedure
      .input(getPaymentHistoryInputSchema)
      .query(({ input }) => getPaymentHistory(input)),
    getReceipt: publicProcedure
      .input(z.number())
      .query(({ input }) => getPaymentReceipt(input)),
    getStatistics: publicProcedure
      .query(() => getPaymentStatistics()),
  }),

  // Dashboard routes
  dashboard: router({
    getStats: publicProcedure
      .input(z.object({
        userId: z.number(),
        userRole: z.string()
      }))
      .query(({ input }) => getDashboardStats(input.userId, input.userRole)),
    getRecentActivities: publicProcedure
      .query(() => getRecentActivities()),
    getTodaysSchedule: publicProcedure
      .input(z.number().optional())
      .query(({ input }) => getTodaysSchedule(input)),
  }),
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`TRPC server listening at port: ${port}`);
}

start();