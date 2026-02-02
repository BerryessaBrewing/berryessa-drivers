import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase Configuration
const supabase = createClient(
  'https://zavqvyyfhjjuvdladjla.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphdnF2eXlmaGpqdXZkbGFkamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1Mzg3MzYsImV4cCI6MjA4NTExNDczNn0.nVjmlsctpIHom764RVJxOa6sxdKyz-inU3THaDg3pb8'
);

const TASK_TYPES = ['Line Cleaning', 'Delivery', 'Pickup', 'Keg Swap', 'Tap Installation', 'Equipment Repair', 'Other'];
const INSPECTION_ITEMS = [
  { id: 'tires', label: 'Tires & Wheels', category: 'exterior' },
  { id: 'lights', label: 'Lights & Reflectors', category: 'exterior' },
  { id: 'mirrors', label: 'Mirrors', category: 'exterior' },
  { id: 'wipers', label: 'Wipers & Washer Fluid', category: 'exterior' },
  { id: 'body', label: 'Body Damage Check', category: 'exterior' },
  { id: 'brakes', label: 'Brake Check', category: 'safety' },
  { id: 'horn', label: 'Horn', category: 'safety' },
  { id: 'seatbelt', label: 'Seatbelt', category: 'safety' },
  { id: 'emergency', label: 'Emergency Equipment', category: 'safety' },
  { id: 'fuel', label: 'Fuel Level', category: 'fluids' },
  { id: 'oil', label: 'Oil Level', category: 'fluids' },
  { id: 'coolant', label: 'Coolant Level', category: 'fluids' },
  { id: 'cargo', label: 'Cargo Secured', category: 'cargo' },
  { id: 'doors', label: 'Doors & Latches', category: 'cargo' },
  { id: 'liftgate', label: 'Liftgate / Ramp', category: 'cargo' },
];

export default function DriverApp() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  
  const [currentView, setCurrentView] = useState('home');
  const [accounts, setAccounts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Forms
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [inspectionType, setInspectionType] = useState('pre'); // pre or post
  
  // Task form state
  const [taskData, setTaskData] = useState({
    type: 'Line Cleaning',
    account_id: '',
    account_name: '',
    notes: '',
    photo_url: ''
  });
  const [useCustomAccount, setUseCustomAccount] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Inspection form state
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [inspectionChecks, setInspectionChecks] = useState({});
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [odometerReading, setOdometerReading] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadUserProfile(session.user.id);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) loadUserProfile(session.user.id);
      else setUserProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId) => {
    const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).single();
    if (data) setUserProfile(data);
  };

  useEffect(() => { if (session && userProfile) loadAllData(); }, [session, userProfile]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Try to load from sales app accounts first, fallback to driver_accounts
      let accountsData;
      const { data: salesAccounts, error: salesError } = await supabase.from('accounts').select('id, name, address, city').order('name');
      
      if (salesError || !salesAccounts) {
        // Fallback to standalone driver_accounts table
        const { data: driverAccounts } = await supabase.from('driver_accounts').select('id, name, address, city').order('name');
        accountsData = driverAccounts || [];
      } else {
        accountsData = salesAccounts;
      }
      
      const [tasksData, inspData, vehiclesData] = await Promise.all([
        supabase.from('driver_tasks').select('*').eq('driver_id', session.user.id).gte('created_at', today).order('created_at', { ascending: false }),
        supabase.from('vehicle_inspections').select('*').eq('driver_id', session.user.id).gte('created_at', today).order('created_at', { ascending: false }),
        supabase.from('vehicles').select('*').eq('active', true).order('name')
      ]);
      
      setAccounts(accountsData);
      if (tasksData.data) setTasks(tasksData.data);
      if (inspData.data) setInspections(inspData.data);
      if (vehiclesData.data) setVehicles(vehiclesData.data);
    } catch (error) { console.error('Error loading data:', error); }
    finally { setLoading(false); }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) setAuthError(error.message);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUserProfile(null);
  };

  // Photo upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('task-photos')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;
      
      const { data: { publicUrl } } = supabase.storage
        .from('task-photos')
        .getPublicUrl(fileName);
      
      setTaskData({ ...taskData, photo_url: publicUrl });
    } catch (error) {
      alert('Error uploading photo: ' + error.message);
    }
    setUploading(false);
  };

  // Submit task
  const handleSubmitTask = async () => {
    if (!taskData.account_id && !taskData.account_name) { 
      alert('Please select an account or enter a name'); 
      return; 
    }
    
    // Get account name for display
    let accountName = taskData.account_name;
    if (taskData.account_id && !useCustomAccount) {
      const account = accounts.find(a => a.id === taskData.account_id);
      accountName = account?.name || '';
    }
    
    try {
      const { data, error } = await supabase.from('driver_tasks').insert([{
        driver_id: session.user.id,
        type: taskData.type,
        account_id: useCustomAccount ? null : taskData.account_id,
        account_name: accountName,
        notes: taskData.notes,
        photo_url: taskData.photo_url,
        completed_at: new Date().toISOString()
      }]).select().single();
      
      if (error) throw error;
      
      setTasks([data, ...tasks]);
      setTaskData({ type: 'Line Cleaning', account_id: '', account_name: '', notes: '', photo_url: '' });
      setUseCustomAccount(false);
      setShowTaskForm(false);
      alert('Task logged successfully!');
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  // Submit inspection
  const handleSubmitInspection = async () => {
    if (!selectedVehicle) { alert('Please select a vehicle'); return; }
    
    const failedItems = Object.entries(inspectionChecks)
      .filter(([key, val]) => val === 'fail')
      .map(([key]) => key);
    
    const passedItems = Object.entries(inspectionChecks)
      .filter(([key, val]) => val === 'pass')
      .map(([key]) => key);
    
    try {
      const { data, error } = await supabase.from('vehicle_inspections').insert([{
        driver_id: session.user.id,
        vehicle_id: selectedVehicle,
        inspection_type: inspectionType,
        odometer: odometerReading ? parseInt(odometerReading) : null,
        passed_items: passedItems,
        failed_items: failedItems,
        notes: inspectionNotes,
        overall_status: failedItems.length === 0 ? 'pass' : 'fail',
        completed_at: new Date().toISOString()
      }]).select().single();
      
      if (error) throw error;
      
      setInspections([data, ...inspections]);
      setInspectionChecks({});
      setInspectionNotes('');
      setOdometerReading('');
      setShowInspectionForm(false);
      
      if (failedItems.length > 0) {
        alert(`Inspection logged with ${failedItems.length} issue(s). Please report to maintenance.`);
      } else {
        alert('Inspection passed! You\'re good to go.');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  const getTodayStats = () => {
    const todayTasks = tasks.length;
    const preTrip = inspections.find(i => i.inspection_type === 'pre');
    const postTrip = inspections.find(i => i.inspection_type === 'post');
    return { todayTasks, preTrip, postTrip };
  };

  const stats = getTodayStats();

  // LOGIN SCREEN
  if (authLoading) {
    return <div style={styles.loadingContainer}><div style={{fontSize:'48px'}}>🚚</div><p style={{color:'#888'}}>Loading...</p></div>;
  }

  if (!session) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginBox}>
          <div style={styles.loginLogo}>
            <span style={{fontSize:'48px'}}>🚚</span>
            <h1 style={styles.loginTitle}>DRIVER LOG</h1>
            <span style={styles.loginSubtitle}>BERRYESSA BREWING CO.</span>
          </div>
          <form onSubmit={handleLogin} style={styles.loginForm}>
            {authError && <div style={styles.authError}>{authError}</div>}
            <div style={styles.formGroup}>
              <label style={styles.label}>Email</label>
              <input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} style={styles.input} required />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} style={styles.input} required />
            </div>
            <button type="submit" style={styles.loginButton}>Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) return <div style={styles.loadingContainer}><div style={{fontSize:'48px'}}>🚚</div><p style={{color:'#888'}}>Loading...</p></div>;

  return (
    <div style={styles.container}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.headerTop}>
          <div style={styles.logo}>
            <span style={{fontSize:'24px'}}>🚚</span>
            <div>
              <h1 style={styles.logoText}>DRIVER LOG</h1>
              <span style={styles.logoSubtext}>{userProfile?.name || 'Driver'}</span>
            </div>
          </div>
          <button onClick={handleLogout} style={styles.logoutButton}>Logout</button>
        </div>
        <nav style={styles.nav}>
          {['home', 'tasks', 'inspections'].map(v => (
            <button key={v} onClick={() => setCurrentView(v)} style={{...styles.navButton,...(currentView===v?styles.navButtonActive:{})}}>{v.charAt(0).toUpperCase()+v.slice(1)}</button>
          ))}
        </nav>
      </header>

      <main style={styles.main}>
        {/* HOME */}
        {currentView === 'home' && (
          <div>
            <h2 style={styles.pageTitle}>Today's Summary</h2>
            <p style={styles.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            
            {/* Quick Status */}
            <div style={styles.statusGrid}>
              <div style={{...styles.statusCard, borderColor: stats.preTrip ? '#22c55e' : '#ef4444'}}>
                <span style={styles.statusIcon}>{stats.preTrip ? '✅' : '⚠️'}</span>
                <span style={styles.statusLabel}>Pre-Trip</span>
                <span style={styles.statusValue}>{stats.preTrip ? 'Complete' : 'Required'}</span>
              </div>
              <div style={styles.statusCard}>
                <span style={styles.statusIcon}>📋</span>
                <span style={styles.statusLabel}>Tasks</span>
                <span style={styles.statusValue}>{stats.todayTasks} logged</span>
              </div>
              <div style={{...styles.statusCard, borderColor: stats.postTrip ? '#22c55e' : '#888'}}>
                <span style={styles.statusIcon}>{stats.postTrip ? '✅' : '🔲'}</span>
                <span style={styles.statusLabel}>Post-Trip</span>
                <span style={styles.statusValue}>{stats.postTrip ? 'Complete' : 'Pending'}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div style={styles.quickActions}>
              {!stats.preTrip && (
                <button style={styles.bigButton} onClick={() => { setInspectionType('pre'); setShowInspectionForm(true); }}>
                  🚛 Start Pre-Trip Inspection
                </button>
              )}
              <button style={styles.bigButtonSecondary} onClick={() => setShowTaskForm(true)}>
                ➕ Log Task
              </button>
              {stats.preTrip && !stats.postTrip && (
                <button style={styles.bigButtonSecondary} onClick={() => { setInspectionType('post'); setShowInspectionForm(true); }}>
                  🏁 End of Day Inspection
                </button>
              )}
            </div>

            {/* Recent Activity */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Recent Activity</h3>
              {tasks.length === 0 && inspections.length === 0 ? (
                <p style={styles.emptyText}>No activity logged yet today.</p>
              ) : (
                <div style={styles.activityList}>
                  {inspections.map(i => (
                    <div key={i.id} style={styles.activityItem}>
                      <span style={styles.activityIcon}>{i.inspection_type === 'pre' ? '🚛' : '🏁'}</span>
                      <div style={styles.activityInfo}>
                        <span style={styles.activityTitle}>{i.inspection_type === 'pre' ? 'Pre-Trip' : 'Post-Trip'} Inspection</span>
                        <span style={styles.activityMeta}>{i.overall_status === 'pass' ? '✅ Passed' : '⚠️ Issues found'}</span>
                      </div>
                      <span style={styles.activityTime}>{new Date(i.completed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                  ))}
                  {tasks.map(t => (
                    <div key={t.id} style={styles.activityItem}>
                      <span style={styles.activityIcon}>📋</span>
                      <div style={styles.activityInfo}>
                        <span style={styles.activityTitle}>{t.type}</span>
                        <span style={styles.activityMeta}>{t.account_name || accounts.find(a => a.id === t.account_id)?.name || 'Unknown'}</span>
                      </div>
                      <span style={styles.activityTime}>{new Date(t.completed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TASKS */}
        {currentView === 'tasks' && (
          <div>
            <div style={styles.pageHeader}>
              <h2 style={styles.pageTitle}>Tasks</h2>
              <button style={styles.primaryButton} onClick={() => setShowTaskForm(true)}>+ Log Task</button>
            </div>
            
            {tasks.length === 0 ? (
              <div style={styles.emptyState}>
                <span style={{fontSize:'48px'}}>📋</span>
                <p>No tasks logged today</p>
                <button style={styles.primaryButton} onClick={() => setShowTaskForm(true)}>Log Your First Task</button>
              </div>
            ) : (
              <div style={styles.taskList}>
                {tasks.map(t => (
                  <div key={t.id} style={styles.taskCard}>
                    <div style={styles.taskHeader}>
                      <span style={styles.taskType}>{t.type}</span>
                      <span style={styles.taskTime}>{new Date(t.completed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <p style={styles.taskAccount}>{t.account_name || accounts.find(a => a.id === t.account_id)?.name || 'Unknown'}</p>
                    {t.notes && <p style={styles.taskNotes}>{t.notes}</p>}
                    {t.photo_url && <img src={t.photo_url} alt="Task photo" style={styles.taskPhoto} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* INSPECTIONS */}
        {currentView === 'inspections' && (
          <div>
            <div style={styles.pageHeader}>
              <h2 style={styles.pageTitle}>Inspections</h2>
              <div style={styles.buttonGroup}>
                <button style={styles.secondaryButton} onClick={() => { setInspectionType('pre'); setShowInspectionForm(true); }}>Pre-Trip</button>
                <button style={styles.secondaryButton} onClick={() => { setInspectionType('post'); setShowInspectionForm(true); }}>Post-Trip</button>
              </div>
            </div>
            
            {inspections.length === 0 ? (
              <div style={styles.emptyState}>
                <span style={{fontSize:'48px'}}>🚛</span>
                <p>No inspections logged today</p>
                <button style={styles.primaryButton} onClick={() => { setInspectionType('pre'); setShowInspectionForm(true); }}>Start Pre-Trip Inspection</button>
              </div>
            ) : (
              <div style={styles.inspectionList}>
                {inspections.map(i => (
                  <div key={i.id} style={{...styles.inspectionCard, borderColor: i.overall_status === 'pass' ? '#22c55e' : '#ef4444'}}>
                    <div style={styles.inspectionHeader}>
                      <span style={styles.inspectionType}>{i.inspection_type === 'pre' ? '🚛 Pre-Trip' : '🏁 Post-Trip'}</span>
                      <span style={{...styles.inspectionStatus, color: i.overall_status === 'pass' ? '#22c55e' : '#ef4444'}}>
                        {i.overall_status === 'pass' ? '✅ PASSED' : '⚠️ ISSUES'}
                      </span>
                    </div>
                    <p style={styles.inspectionVehicle}>{vehicles.find(v => v.id === i.vehicle_id)?.name || 'Vehicle'}</p>
                    {i.odometer && <p style={styles.inspectionOdometer}>Odometer: {i.odometer.toLocaleString()} mi</p>}
                    {i.failed_items?.length > 0 && (
                      <div style={styles.failedItems}>
                        <span style={styles.failedLabel}>Issues:</span>
                        {i.failed_items.map(item => (
                          <span key={item} style={styles.failedItem}>{INSPECTION_ITEMS.find(x => x.id === item)?.label || item}</span>
                        ))}
                      </div>
                    )}
                    {i.notes && <p style={styles.inspectionNotes}>{i.notes}</p>}
                    <span style={styles.inspectionTime}>{new Date(i.completed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* TASK FORM MODAL */}
      {showTaskForm && (
        <div style={styles.modalOverlay} onClick={() => setShowTaskForm(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Log Task</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Task Type</label>
              <select value={taskData.type} onChange={e => setTaskData({...taskData, type: e.target.value})} style={styles.select}>
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Account *</label>
              <div style={styles.toggleRow}>
                <button 
                  style={{...styles.toggleBtn, ...(!useCustomAccount ? styles.toggleBtnActive : {})}} 
                  onClick={() => setUseCustomAccount(false)}
                >
                  Select
                </button>
                <button 
                  style={{...styles.toggleBtn, ...(useCustomAccount ? styles.toggleBtnActive : {})}} 
                  onClick={() => setUseCustomAccount(true)}
                >
                  Type Name
                </button>
              </div>
              
              {!useCustomAccount ? (
                <select value={taskData.account_id} onChange={e => setTaskData({...taskData, account_id: e.target.value})} style={styles.select}>
                  <option value="">Select account...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              ) : (
                <input 
                  type="text" 
                  value={taskData.account_name} 
                  onChange={e => setTaskData({...taskData, account_name: e.target.value})} 
                  style={styles.input} 
                  placeholder="Enter account/location name"
                />
              )}
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Notes</label>
              <textarea value={taskData.notes} onChange={e => setTaskData({...taskData, notes: e.target.value})} style={styles.textarea} rows={3} placeholder="Any details..." />
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Photo</label>
              {taskData.photo_url ? (
                <div style={styles.photoPreview}>
                  <img src={taskData.photo_url} alt="Preview" style={styles.previewImage} />
                  <button style={styles.removePhotoBtn} onClick={() => setTaskData({...taskData, photo_url: ''})}>✕</button>
                </div>
              ) : (
                <label style={styles.photoUploadBtn}>
                  {uploading ? 'Uploading...' : '📷 Add Photo'}
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoUpload} style={{display:'none'}} disabled={uploading} />
                </label>
              )}
            </div>
            
            <div style={styles.modalActions}>
              <button style={styles.cancelButton} onClick={() => setShowTaskForm(false)}>Cancel</button>
              <button style={styles.submitButton} onClick={handleSubmitTask}>Log Task</button>
            </div>
          </div>
        </div>
      )}

      {/* INSPECTION FORM MODAL */}
      {showInspectionForm && (
        <div style={styles.modalOverlay} onClick={() => setShowInspectionForm(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>{inspectionType === 'pre' ? '🚛 Pre-Trip' : '🏁 Post-Trip'} Inspection</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Vehicle *</label>
              <select value={selectedVehicle} onChange={e => setSelectedVehicle(e.target.value)} style={styles.select}>
                <option value="">Select vehicle...</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} - {v.plate}</option>)}
              </select>
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Odometer Reading</label>
              <input type="number" value={odometerReading} onChange={e => setOdometerReading(e.target.value)} style={styles.input} placeholder="Enter mileage" />
            </div>
            
            <div style={styles.checklistSection}>
              <label style={styles.label}>Inspection Checklist</label>
              {['exterior', 'safety', 'fluids', 'cargo'].map(category => (
                <div key={category} style={styles.checklistCategory}>
                  <span style={styles.categoryLabel}>{category.charAt(0).toUpperCase() + category.slice(1)}</span>
                  {INSPECTION_ITEMS.filter(item => item.category === category).map(item => (
                    <div key={item.id} style={styles.checklistItem}>
                      <span style={styles.checklistLabel}>{item.label}</span>
                      <div style={styles.checklistButtons}>
                        <button 
                          style={{...styles.checkBtn, ...(inspectionChecks[item.id] === 'pass' ? styles.checkBtnPass : {})}}
                          onClick={() => setInspectionChecks({...inspectionChecks, [item.id]: 'pass'})}
                        >✓</button>
                        <button 
                          style={{...styles.checkBtn, ...(inspectionChecks[item.id] === 'fail' ? styles.checkBtnFail : {})}}
                          onClick={() => setInspectionChecks({...inspectionChecks, [item.id]: 'fail'})}
                        >✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Notes / Issues</label>
              <textarea value={inspectionNotes} onChange={e => setInspectionNotes(e.target.value)} style={styles.textarea} rows={3} placeholder="Describe any issues..." />
            </div>
            
            <div style={styles.modalActions}>
              <button style={styles.cancelButton} onClick={() => setShowInspectionForm(false)}>Cancel</button>
              <button style={styles.submitButton} onClick={handleSubmitInspection}>Complete Inspection</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container:{fontFamily:"'DM Sans',-apple-system,sans-serif",minHeight:'100vh',backgroundColor:'#0f0f0f',color:'#e5e5e5'},
  loadingContainer:{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',backgroundColor:'#0f0f0f'},
  
  loginContainer:{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',backgroundColor:'#0f0f0f',padding:'20px'},
  loginBox:{backgroundColor:'#1a1a1a',borderRadius:'16px',padding:'32px',width:'100%',maxWidth:'400px',border:'1px solid #2a2a2a'},
  loginLogo:{textAlign:'center',marginBottom:'24px'},
  loginTitle:{fontSize:'20px',fontWeight:'700',color:'#3b82f6',letterSpacing:'2px',margin:'12px 0 4px 0'},
  loginSubtitle:{fontSize:'10px',color:'#888',letterSpacing:'3px'},
  loginForm:{},
  loginButton:{width:'100%',padding:'14px',backgroundColor:'#3b82f6',border:'none',borderRadius:'8px',color:'#fff',fontSize:'16px',fontWeight:'600',cursor:'pointer',marginTop:'8px'},
  authError:{backgroundColor:'rgba(239,68,68,0.1)',border:'1px solid #ef4444',borderRadius:'8px',padding:'12px',marginBottom:'16px',color:'#ef4444',fontSize:'14px'},
  
  header:{backgroundColor:'#1a1a1a',borderBottom:'1px solid #2a2a2a',padding:'12px 16px',position:'sticky',top:0,zIndex:100},
  headerTop:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'},
  logo:{display:'flex',alignItems:'center',gap:'10px'},
  logoText:{fontSize:'16px',fontWeight:'700',color:'#3b82f6',margin:0},
  logoSubtext:{fontSize:'11px',color:'#888'},
  logoutButton:{padding:'6px 12px',backgroundColor:'transparent',border:'1px solid #2a2a2a',borderRadius:'6px',color:'#888',fontSize:'12px',cursor:'pointer'},
  nav:{display:'flex',gap:'8px'},
  navButton:{flex:1,padding:'10px',backgroundColor:'#2a2a2a',border:'none',color:'#888',fontSize:'13px',fontWeight:'500',cursor:'pointer',borderRadius:'8px',textAlign:'center'},
  navButtonActive:{backgroundColor:'#3b82f6',color:'#fff'},
  
  main:{padding:'16px',maxWidth:'600px',margin:'0 auto'},
  pageTitle:{fontSize:'24px',fontWeight:'700',color:'#fff',margin:'0 0 8px 0'},
  pageHeader:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'},
  dateText:{fontSize:'14px',color:'#888',marginBottom:'20px'},
  
  statusGrid:{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',marginBottom:'24px'},
  statusCard:{backgroundColor:'#1a1a1a',borderRadius:'12px',padding:'16px',border:'2px solid #2a2a2a',textAlign:'center'},
  statusIcon:{fontSize:'24px',display:'block',marginBottom:'8px'},
  statusLabel:{fontSize:'11px',color:'#888',display:'block',marginBottom:'4px'},
  statusValue:{fontSize:'13px',color:'#fff',fontWeight:'600'},
  
  quickActions:{display:'flex',flexDirection:'column',gap:'12px',marginBottom:'24px'},
  bigButton:{padding:'20px',backgroundColor:'#3b82f6',border:'none',borderRadius:'12px',color:'#fff',fontSize:'16px',fontWeight:'600',cursor:'pointer'},
  bigButtonSecondary:{padding:'16px',backgroundColor:'#2a2a2a',border:'1px solid #3a3a3a',borderRadius:'12px',color:'#fff',fontSize:'15px',fontWeight:'500',cursor:'pointer'},
  
  section:{marginBottom:'24px'},
  sectionTitle:{fontSize:'16px',fontWeight:'600',color:'#fff',marginBottom:'12px'},
  
  emptyText:{color:'#666',textAlign:'center',padding:'20px'},
  emptyState:{textAlign:'center',padding:'40px 20px'},
  
  activityList:{display:'flex',flexDirection:'column',gap:'8px'},
  activityItem:{display:'flex',alignItems:'center',gap:'12px',padding:'12px',backgroundColor:'#1a1a1a',borderRadius:'8px'},
  activityIcon:{fontSize:'20px'},
  activityInfo:{flex:1},
  activityTitle:{display:'block',fontSize:'14px',fontWeight:'500',color:'#fff'},
  activityMeta:{display:'block',fontSize:'12px',color:'#888'},
  activityTime:{fontSize:'12px',color:'#666'},
  
  taskList:{display:'flex',flexDirection:'column',gap:'12px'},
  taskCard:{backgroundColor:'#1a1a1a',borderRadius:'12px',padding:'16px',border:'1px solid #2a2a2a'},
  taskHeader:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'},
  taskType:{fontSize:'14px',fontWeight:'600',color:'#3b82f6'},
  taskTime:{fontSize:'12px',color:'#666'},
  taskAccount:{fontSize:'15px',color:'#fff',margin:'0 0 8px 0'},
  taskNotes:{fontSize:'13px',color:'#888',margin:'0 0 12px 0'},
  taskPhoto:{width:'100%',maxHeight:'200px',objectFit:'cover',borderRadius:'8px'},
  
  inspectionList:{display:'flex',flexDirection:'column',gap:'12px'},
  inspectionCard:{backgroundColor:'#1a1a1a',borderRadius:'12px',padding:'16px',borderLeft:'4px solid #2a2a2a'},
  inspectionHeader:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'},
  inspectionType:{fontSize:'15px',fontWeight:'600',color:'#fff'},
  inspectionStatus:{fontSize:'12px',fontWeight:'600'},
  inspectionVehicle:{fontSize:'14px',color:'#888',margin:'0 0 4px 0'},
  inspectionOdometer:{fontSize:'13px',color:'#666',margin:'0 0 8px 0'},
  inspectionNotes:{fontSize:'13px',color:'#888',margin:'8px 0 0 0'},
  inspectionTime:{fontSize:'12px',color:'#666'},
  failedItems:{marginTop:'8px'},
  failedLabel:{fontSize:'12px',color:'#ef4444',display:'block',marginBottom:'4px'},
  failedItem:{display:'inline-block',fontSize:'11px',color:'#ef4444',backgroundColor:'rgba(239,68,68,0.1)',padding:'2px 8px',borderRadius:'4px',marginRight:'4px',marginBottom:'4px'},
  
  buttonGroup:{display:'flex',gap:'8px'},
  primaryButton:{padding:'10px 20px',backgroundColor:'#3b82f6',border:'none',borderRadius:'8px',color:'#fff',fontSize:'14px',fontWeight:'600',cursor:'pointer'},
  secondaryButton:{padding:'10px 16px',backgroundColor:'#2a2a2a',border:'1px solid #3a3a3a',borderRadius:'8px',color:'#fff',fontSize:'14px',cursor:'pointer'},
  
  modalOverlay:{position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.9)',display:'flex',justifyContent:'center',alignItems:'flex-start',zIndex:1000,padding:'16px',overflowY:'auto'},
  modalContent:{backgroundColor:'#1a1a1a',borderRadius:'16px',padding:'20px',width:'100%',maxWidth:'500px',border:'1px solid #2a2a2a',marginTop:'20px',marginBottom:'20px'},
  modalTitle:{fontSize:'18px',fontWeight:'600',color:'#fff',marginBottom:'20px'},
  modalActions:{display:'flex',gap:'12px',marginTop:'20px'},
  
  formGroup:{marginBottom:'16px'},
  label:{display:'block',fontSize:'13px',fontWeight:'500',color:'#888',marginBottom:'8px'},
  input:{width:'100%',padding:'12px',backgroundColor:'#0f0f0f',border:'1px solid #2a2a2a',borderRadius:'8px',color:'#fff',fontSize:'14px',boxSizing:'border-box'},
  select:{width:'100%',padding:'12px',backgroundColor:'#0f0f0f',border:'1px solid #2a2a2a',borderRadius:'8px',color:'#fff',fontSize:'14px',boxSizing:'border-box'},
  textarea:{width:'100%',padding:'12px',backgroundColor:'#0f0f0f',border:'1px solid #2a2a2a',borderRadius:'8px',color:'#fff',fontSize:'14px',resize:'vertical',fontFamily:'inherit',boxSizing:'border-box'},
  
  photoUploadBtn:{display:'block',padding:'40px 20px',backgroundColor:'#0f0f0f',border:'2px dashed #2a2a2a',borderRadius:'8px',color:'#888',fontSize:'14px',textAlign:'center',cursor:'pointer'},
  photoPreview:{position:'relative'},
  previewImage:{width:'100%',maxHeight:'200px',objectFit:'cover',borderRadius:'8px'},
  removePhotoBtn:{position:'absolute',top:'8px',right:'8px',width:'28px',height:'28px',backgroundColor:'rgba(0,0,0,0.7)',border:'none',borderRadius:'50%',color:'#fff',fontSize:'14px',cursor:'pointer'},
  
  checklistSection:{marginBottom:'16px'},
  checklistCategory:{marginBottom:'16px'},
  categoryLabel:{display:'block',fontSize:'12px',fontWeight:'600',color:'#3b82f6',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'1px'},
  checklistItem:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #2a2a2a'},
  checklistLabel:{fontSize:'14px',color:'#ccc'},
  checklistButtons:{display:'flex',gap:'8px'},
  checkBtn:{width:'36px',height:'36px',border:'1px solid #2a2a2a',borderRadius:'8px',backgroundColor:'#0f0f0f',color:'#666',fontSize:'16px',cursor:'pointer'},
  checkBtnPass:{backgroundColor:'#22c55e',borderColor:'#22c55e',color:'#fff'},
  checkBtnFail:{backgroundColor:'#ef4444',borderColor:'#ef4444',color:'#fff'},
  
  cancelButton:{flex:1,padding:'14px',backgroundColor:'transparent',border:'1px solid #2a2a2a',borderRadius:'8px',color:'#888',fontSize:'14px',cursor:'pointer'},
  submitButton:{flex:1,padding:'14px',backgroundColor:'#3b82f6',border:'none',borderRadius:'8px',color:'#fff',fontSize:'14px',fontWeight:'600',cursor:'pointer'},
  toggleRow:{display:'flex',gap:'8px',marginBottom:'8px'},
  toggleBtn:{flex:1,padding:'10px',backgroundColor:'#0f0f0f',border:'1px solid #2a2a2a',borderRadius:'6px',color:'#888',fontSize:'13px',cursor:'pointer'},
  toggleBtnActive:{backgroundColor:'#3b82f6',borderColor:'#3b82f6',color:'#fff'},
};
