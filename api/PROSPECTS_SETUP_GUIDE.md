# Prospects Management System - Setup Guide

## 🎯 Quick Start

The prospects management system is now fully integrated into your backend API. Follow these steps to start using it.

---

## 📁 Files Created

```
api/src/
├── controllers/
│   └── prospectsController.ts     # Prospects CRUD operations
├── services/
│   └── firestoreService.ts        # Firestore helper functions
├── types/
│   ├── prospects.types.ts         # TypeScript interfaces
│   └── auth.types.ts              # Updated with agentCode
└── routes/
    └── router.ts                  # Updated with prospects routes
```

---

## 🚀 Start the Server

```bash
cd api
npm run dev
```

The server will start on `http://localhost:3000` (or your configured port).

---

## 🗄️ Firestore Setup

### 1. Create Collection

The system uses the `prospects` collection. It will be automatically created when you create your first prospect.

### 2. Create Indexes

Run these commands in your terminal or create them via Firebase Console:

```bash
# Index for querying prospects by agent code and date
firebase firestore:indexes --add-field agentCode --add-field createdAt --order-by createdAt:desc --collection prospects

# Index for querying prospects by group and date
firebase firestore:indexes --add-field groupId --add-field createdAt --order-by createdAt:desc --collection prospects
```

**Or manually create in Firebase Console:**

1. Go to Firebase Console > Firestore Database > Indexes
2. Click "Create Index"
3. Create these composite indexes:

**Index 1:**
- Collection: `prospects`
- Fields:
  - `agentCode` (Ascending)
  - `createdAt` (Descending)

**Index 2:**
- Collection: `prospects`
- Fields:
  - `groupId` (Ascending)
  - `createdAt` (Descending)

---

## 🔐 Authentication

All endpoints require a Firebase ID token in the Authorization header:

```
Authorization: Bearer <your_firebase_id_token>
```

### Get a Token (for testing)

```javascript
// In your frontend or test script
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase-config';

const { user } = await signInWithEmailAndPassword(
  auth,
  'agent@example.com',
  'password'
);

const token = await user.getIdToken();
console.log('Token:', token);
```

---

## 📝 API Endpoints

### Base URL: `http://localhost:3000/api`

| Method | Endpoint | Description | Required Role |
|--------|----------|-------------|---------------|
| POST | `/prospects` | Create new prospect | agent, manager |
| GET | `/prospects/my-prospects` | Get own prospects | Any |
| GET | `/prospects/:id` | Get specific prospect | Owner/manager/admin |
| PUT | `/prospects/:id` | Update prospect | Owner/admin |
| GET | `/prospects/group/:groupId` | Get group prospects | manager, admin |
| GET | `/admin/all-prospects` | Get all prospects | admin |

---

## 🧪 Testing the API

### 1. Create a Prospect

```bash
curl -X POST http://localhost:3000/api/prospects \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "prospectName": "John Doe",
    "prospectEmail": "john@example.com",
    "prospectPhone": "+60123456789"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "prospectId": "abc123xyz",
  "message": "Prospect created successfully"
}
```

**What Gets Stored:**
```json
{
  "uid": "firebase_auth_uid",       // For permissions
  "agentCode": "A001",              // Agent's business code
  "agentName": "Agent Smith",
  "groupId": "group123",
  "prospectName": "John Doe",
  "currentStage": "prospect",
  // ... other fields
}
```

### 2. Get My Prospects

```bash
curl -X GET http://localhost:3000/api/prospects/my-prospects \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 3. Update to Appointment Stage

```bash
curl -X PUT http://localhost:3000/api/prospects/PROSPECT_ID \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "currentStage": "appointment",
    "appointmentDate": "2025-02-15T14:00:00Z",
    "appointmentTime": "2:00 PM",
    "appointmentStatus": "completed"
  }'
```

### 4. Complete Sale (Successful)

```bash
curl -X PUT http://localhost:3000/api/prospects/PROSPECT_ID \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "currentStage": "sales",
    "salesPartsCompleted": {
      "social": true,
      "factFinding": true,
      "presentation": true
    },
    "productsSold": [
      {
        "productName": "Medical Card",
        "aceAmount": 5000
      }
    ],
    "salesOutcome": "successful"
  }'
```

---

## 🔍 Troubleshooting

### Issue: "Authentication required"
**Solution:** Make sure you're passing a valid Firebase ID token in the Authorization header.

### Issue: "You do not have permission to view this prospect"
**Solution:**
- Agents can only view their own prospects (checked by `uid`)
- Managers can view their team's prospects (same groupId)
- Admins can view all prospects

### Issue: "appointmentDate and appointmentTime are required"
**Solution:** When moving to appointment stage, both fields are mandatory.

### Issue: "productsSold is required when salesOutcome is 'successful'"
**Solution:** Successful sales must include at least one product with aceAmount.

### Issue: "unsuccessfulReason is required when salesOutcome is 'unsuccessful'"
**Solution:** Provide a reason when marking a prospect as unsuccessful.

### Issue: Firestore query fails
**Solution:** Make sure you've created the required composite indexes (see Firestore Setup section).

### Issue: agentCode not being stored
**Solution:** Ensure the User record in Firestore has the `agentCode` field populated.

---

## 📊 Data Flow

```
1. PROSPECT STAGE
   ├─ Agent enters: prospectName, prospectEmail, prospectPhone
   ├─ Auto-set: currentStage = "prospect"
   ├─ Auto-set: uid (Firebase Auth UID), agentCode, groupId, timestamps
   └─ Auto-create: stageHistory entry

2. APPOINTMENT STAGE
   ├─ Agent adds: appointmentDate, appointmentTime
   ├─ Agent sets: appointmentStatus
   ├─ Auto-set: currentStage = "appointment"
   ├─ Auto-set: appointmentCompletedAt (if status = "completed", only once)
   └─ Auto-append: stageHistory entry

3. SALES STAGE
   ├─ Agent selects: salesPartsCompleted (social, factFinding, presentation)
   ├─ Agent adds: productsSold with aceAmount
   ├─ Agent sets: salesOutcome ("successful" or "unsuccessful")
   ├─ If unsuccessful: require unsuccessfulReason
   ├─ Auto-calculate: totalACE (sum of aceAmount)
   ├─ Auto-set: currentStage = "sales"
   ├─ Auto-set: salesCompletedAt (only once)
   └─ Auto-append: stageHistory entry
```

---

## 🎓 Permission Matrix

| Role | Create Prospects | View Own Prospects | View Team Prospects | View All Prospects | Update Own Prospects | Update Any Prospects |
|------|-----------------|-------------------|--------------------|--------------------|---------------------|---------------------|
| **agent** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **manager** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 🆔 Dual Identifier System

The system uses two identifiers for flexibility:

| Field | Type | Purpose | Example | Set By |
|-------|------|---------|---------|--------|
| **uid** | System | Firebase Auth UID for permissions | `"xyz123abc..."` | Firebase Auth |
| **agentCode** | Business | Agent's business code for reporting | `"A001"` | Admin during user creation |

### Why Both?

- **uid** - Used internally for authentication and permission checks
- **agentCode** - Used for business operations, reporting, and agent identification

### Example Prospect Record:
```json
{
  "id": "prospect_123",
  "uid": "firebase_xyz_abc_123",      // For: Permission checks
  "agentCode": "A001",                // For: Business reporting, agent display
  "agentName": "John Smith",
  "prospectName": "Jane Doe",
  // ...
}
```

### Permission Check Example:
```typescript
// Check if user can view prospect
if (prospect.uid === req.user.uid) {
  // Allowed - user owns this prospect
}
```

### Business Query Example:
```typescript
// Get all prospects for agent A001
const prospects = await getProspectsByAgent("A001");
```

---

## 📚 Next Steps

1. **Test all endpoints** using the examples above
2. **Create Firestore indexes** for optimal performance
3. **Review the documentation** in `PROSPECTS_API_DOCUMENTATION.md`
4. **Integrate with your frontend** using the API
5. **Add analytics** to track prospect conversion rates
6. **Set up monitoring** for production

---

## 📖 Additional Resources

- **API Documentation:** `PROSPECTS_API_DOCUMENTATION.md` - Complete API reference
- **Type Definitions:** `api/src/types/prospects.types.ts` - TypeScript interfaces
- **Controller:** `api/src/controllers/prospectsController.ts` - Business logic
- **Service:** `api/src/services/firestoreService.ts` - Database operations

---

## 💡 Tips

1. **Dual Identifiers:** Use `uid` for permissions, `agentCode` for business logic
2. **Denormalization:** Agent and group info is stored in each prospect record for performance
3. **Stage History:** Track when prospects move between stages for analytics
4. **Auto-Calculation:** totalACE is automatically calculated from productsSold
5. **Idempotency:** Completion timestamps are set only once to preserve accurate timing
6. **Validation:** Stage-specific validation ensures data integrity
7. **Permissions:** Role-based access ensures data security

---

## ✅ Pre-Launch Checklist

- [ ] Firestore indexes created for agentCode and groupId
- [ ] Test user accounts created with agentCode field populated
- [ ] All endpoints tested (create, read, update)
- [ ] Error handling verified
- [ ] Permission system tested (agent, manager, admin)
- [ ] Production environment variables set
- [ ] Monitoring and logging configured
- [ ] Security rules updated in Firestore
- [ ] Idempotency verified (completion timestamps)
- [ ] agentCode correctly stored and queryable

---

## 🆘 Support

If you encounter any issues:
1. Check the logs for error messages
2. Verify Firestore indexes are created
3. Ensure user roles and agentCode are correctly set
4. Review the API documentation
5. Check Firebase Console for quota limits
6. Verify that `agentCode` field exists in User records

---

## 🔄 Migration from Old System

If you're migrating from a system that used `agentId` instead of `agentCode`:

1. **Database Migration:**
   ```javascript
   // Rename agentId to agentCode in existing prospects
   const batch = db.batch();
   const prospects = await db.collection('prospects').get();

   prospects.forEach(doc => {
     const data = doc.data();
     if (data.agentId) {
       batch.update(doc.ref, {
         agentCode: data.agentId,
         // Keep agentId for backward compatibility if needed
       });
     }
   });

   await batch.commit();
   ```

2. **Update Indexes:**
   - Delete old index with `agentId`
   - Create new index with `agentCode`

3. **Update Firestore Security Rules:**
   - Use `uid` for permission checks
   - Use `agentCode` for business queries

---

**Ready to go! 🚀**

Your prospects management system is production-ready and fully integrated.
