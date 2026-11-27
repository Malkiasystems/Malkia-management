import type { Employee } from './hrmTypes'
import { DEPT_COLORS } from './hrmTypes'

export type DirectoryView = 'Cards' | 'Compact' | 'List'

export function EmployeeDirectoryViews({ view, employees, open, canEdit }: {
  view: 'Compact' | 'List'
  employees: Employee[]
  open: (employee: Employee, edit?: boolean) => void
  canEdit: boolean
}) {
  if (view === 'Compact') return (
    <div className="employee-tiles">
      {employees.map(emp => (
        <button key={emp.id} className="employee-tile" aria-label={`View profile for ${emp.full_name}`} onClick={() => open(emp)}>
          <span className="employee-tile-avatar" style={{ background: (DEPT_COLORS[emp.department] || '#6366f1') + '22' }}>{emp.initials}</span>
          <strong>{emp.full_name}</strong><small>{emp.job_title || emp.emp_code}</small>
        </button>
      ))}
    </div>
  )
  return (
    <div className="card employee-list"><table>
      <thead><tr><th>Employee</th><th>Department</th><th>Contract ends</th><th>Gross (TZS)</th><th>Actions</th></tr></thead>
      <tbody>{employees.map(emp => (
        <tr key={emp.id}><td><strong>{emp.full_name}</strong><small>{emp.emp_code} · {emp.job_title}</small></td>
          <td>{emp.department}</td><td>{emp.end_date || 'Open-ended'}</td><td>{Number(emp.gross_salary || 0).toLocaleString()}</td>
          <td><div className="employee-list-actions">
            <button className="btn btn-ghost" onClick={() => open(emp)}>View profile</button>
            {canEdit && emp.is_active && <button className="btn btn-ghost" onClick={() => open(emp, true)}>Edit</button>}
          </div></td></tr>
      ))}</tbody>
    </table></div>
  )
}
