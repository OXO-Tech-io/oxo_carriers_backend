import { db } from '../db';
import * as schema from '../db/schema';
import bcrypt from 'bcryptjs';

async function seed() {
    console.log('🌱 Starting database seeding...');

    try {
        // Check if super admin already exists
        const existingAdmin = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.email, 'admin@oxocarriers.com'),
        });

        if (existingAdmin) {
            console.log('✅ Super admin already exists. Skipping seed.');
            return;
        }

        // Create default super admin
        const hashedPassword = await bcrypt.hash('Admin@123', 10);

        const [admin] = await db.insert(schema.users).values({
            employeeId: 'EMP001',
            email: 'admin@oxocarriers.com',
            password: hashedPassword,
            firstName: 'Super',
            lastName: 'Admin',
            role: 'super_admin',
            emailVerified: true,
            department: 'Administration',
            position: 'System Administrator',
            hireDate: new Date().toISOString().split('T')[0],
        }).returning();

        console.log('✅ Super admin created:', admin.email);

        // Create default leave types
        const leaveTypesData = [
            { name: 'Annual Leave', description: 'Annual paid leave', maxDays: 21, isActive: true },
            { name: 'Sick Leave', description: 'Medical sick leave', maxDays: 14, isActive: true },
            { name: 'Casual Leave', description: 'Short notice casual leave', maxDays: 7, isActive: true },
        ];

        await db.insert(schema.leaveTypes).values(leaveTypesData);
        console.log('✅ Default leave types created');

        // Create default salary components
        const salaryComponentsData = [
            { name: 'Basic Salary', type: 'earning' as const, isDefault: true, isActive: true },
            { name: 'House Rent Allowance', type: 'earning' as const, isDefault: true, isActive: true },
            { name: 'Transport Allowance', type: 'earning' as const, isDefault: false, isActive: true },
            { name: 'Tax Deduction', type: 'deduction' as const, isDefault: true, isActive: true },
            { name: 'Provident Fund', type: 'deduction' as const, isDefault: false, isActive: true },
        ];

        await db.insert(schema.salaryComponents).values(salaryComponentsData);
        console.log('✅ Default salary components created');

        // Create sample facility
        await db.insert(schema.facilities).values({
            name: 'Board Room A',
            type: 'board_room',
            description: 'Main conference room with video conferencing',
            facilities: 'Projector, Whiteboard, Video Conferencing',
            capacity: 12,
            isActive: true,
        });
        console.log('✅ Sample facility created');

        console.log('🎉 Database seeding completed successfully!');
    } catch (error) {
        console.error('❌ Error seeding database:', error);
        throw error;
    } finally {
        process.exit(0);
    }
}

seed();
