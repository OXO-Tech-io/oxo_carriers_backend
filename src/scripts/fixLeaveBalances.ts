import pool from '../config/database';

async function fixLeaveBalances() {
  try {
    console.log('🔧 Fixing leave balances...');
    
    // Update all remaining_days to be calculated from total_days - used_days
    const [result] = await pool.execute(
      `UPDATE employee_leave_balance 
       SET remaining_days = total_days - used_days
       WHERE remaining_days != (total_days - used_days) OR remaining_days IS NULL`
    );
    
    const updateResult = result as any;
    console.log(`✅ Updated ${updateResult.affectedRows} leave balance records`);
    
    // Also ensure all users have leave balances for current year
    const currentYear = new Date().getFullYear();
    const [users] = await pool.execute('SELECT id FROM users');
    const [leaveTypes] = await pool.execute('SELECT id, max_days FROM leave_types WHERE is_active = true');
    
    const userList = users as any[];
    const typesList = leaveTypes as any[];
    
    let created = 0;
    for (const user of userList) {
      for (const type of typesList) {
        // Check if balance exists
        const [existing] = await pool.execute(
          'SELECT id FROM employee_leave_balance WHERE user_id = ? AND leave_type_id = ? AND year = ?',
          [user.id, type.id, currentYear]
        );
        
        const existingList = existing as any[];
        if (existingList.length === 0) {
          // Create missing balance
          await pool.execute(
            'INSERT INTO employee_leave_balance (user_id, leave_type_id, total_days, used_days, remaining_days, year) VALUES (?, ?, ?, 0, ?, ?)',
            [user.id, type.id, type.max_days, type.max_days, currentYear]
          );
          created++;
        }
      }
    }
    
    if (created > 0) {
      console.log(`✅ Created ${created} missing leave balance records`);
    }
    
    console.log('✅ Leave balances fixed successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error fixing leave balances:', error);
    process.exit(1);
  }
}

fixLeaveBalances();
