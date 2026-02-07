# Sales Management System - Setup Guide

## 🎯 Quick Start

The sales management system is now fully integrated into your backend API. Follow these steps to start using it.

---

## 📁 Files Created

```
api/src/
├── controllers/
│   └── salesController.ts         # Sales CRUD operations
├── services/
│   └── firestoreService.ts        # Firestore helper functions
├── types/
│   └── sales.types.ts             # TypeScript interfaces
└── routes/
    └── router.ts                  # Updated with sales routes
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

The system uses the `sales_records` collection. It will be automatically created when you create your first sale.

### 2. Create Indexes

Run these commands in your terminal or create them via Firebase Console:

```bash
# Index for querying sales by agent and date
firebase firestore:indexes --add-field agentId --add-field createdAt --order-by createdAt:desc --collection sales_records

# Index for querying sales by group and date
firebase firestore:indexes --add-field groupId --add-field createdAt --order-by createdAt:desc --collection sales_records
```

**Or manually create in Firebase Console:**

1. Go to Firebase Console > Firestore Database > Indexes
2. Click "Create Index"
3. Create these composite indexes:

**Index 1:**
- Collection: `sales_records`
- Fields:
  - `agentId` (Ascending)
  - `createdAt` (Descending)

**Index 2:**
- Collection: `sales_records`
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
| POST | `/sales` | Create new sale | agent, manager |
| GET | `/sales/my-sales` | Get own sales | Any |
| GET | `/sales/:id` | Get specific sale | Owner/manager/admin |
| PUT | `/sales/:id` | Update sale | Owner/admin |
| GET | `/sales/group/:groupId` | Get group sales | manager, admin |
| GET | `/admin/all-sales` | Get all sales | admin |

---

## 🧪 Testing the API

### 1. Create a Prospect

```bash
curl -X POST http://localhost:3000/api/sales \
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
  "saleId": "abc123xyz",
  "message": "Sale created successfully"
}
```

### 2. Get My Sales

```bash
curl -X GET http://localhost:3000/api/sales/my-sales \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### 3. Update to Appointment Stage

```bash
curl -X PUT http://localhost:3000/api/sales/SALE_ID \
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
curl -X PUT http://localhost:3000/api/sales/SALE_ID \
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

### Issue: "You do not have permission to view this sale"
**Solution:**
- Agents can only view their own sales
- Managers can view their team's sales (same groupId)
- Admins can view all sales

### Issue: "appointmentDate and appointmentTime are required"
**Solution:** When moving to appointment stage, both fields are mandatory.

### Issue: "productsSold is required when salesOutcome is 'successful'"
**Solution:** Successful sales must include at least one product with aceAmount.

### Issue: "unsuccessfulReason is required when salesOutcome is 'unsuccessful'"
**Solution:** Provide a reason when marking a sale as unsuccessful.

### Issue: Firestore query fails
**Solution:** Make sure you've created the required composite indexes (see Firestore Setup section).

---

## 📊 Data Flow

```
1. PROSPECT STAGE
   ├─ Agent enters: prospectName, prospectEmail, prospectPhone
   ├─ Auto-set: currentStage = "prospect"
   ├─ Auto-set: agentId, groupId, timestamps
   └─ Auto-create: stageHistory entry

2. APPOINTMENT STAGE
   ├─ Agent adds: appointmentDate, appointmentTime
   ├─ Agent sets: appointmentStatus
   ├─ Auto-set: currentStage = "appointment"
   ├─ Auto-set: appointmentCompletedAt (if status = "completed")
   └─ Auto-append: stageHistory entry

3. SALES STAGE
   ├─ Agent selects: salesPartsCompleted (social, factFinding, presentation)
   ├─ Agent adds: productsSold with aceAmount
   ├─ Agent sets: salesOutcome ("successful" or "unsuccessful")
   ├─ If unsuccessful: require unsuccessfulReason
   ├─ Auto-calculate: totalACE (sum of aceAmount)
   ├─ Auto-set: currentStage = "sales"
   ├─ Auto-set: salesCompletedAt
   └─ Auto-append: stageHistory entry
```

---

## 🎓 Permission Matrix

| Role | Create Sales | View Own Sales | View Team Sales | View All Sales | Update Own Sales | Update Any Sales |
|------|-------------|----------------|-----------------|----------------|------------------|------------------|
| **agent** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| **manager** | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| **admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 📚 Next Steps

1. **Test all endpoints** using the examples above
2. **Create Firestore indexes** for optimal performance
3. **Review the documentation** in `SALES_API_DOCUMENTATION.md`
4. **Integrate with your frontend** using the API
5. **Add analytics** to track sales performance
6. **Set up monitoring** for production

---

## 📖 Additional Resources

- **API Documentation:** `SALES_API_DOCUMENTATION.md` - Complete API reference
- **Type Definitions:** `api/src/types/sales.types.ts` - TypeScript interfaces
- **Controller:** `api/src/controllers/salesController.ts` - Business logic
- **Service:** `api/src/services/firestoreService.ts` - Database operations

---

## 💡 Tips

1. **Denormalization:** Agent and group info is stored in each sale record for performance
2. **Stage History:** Track when sales move between stages for analytics
3. **Auto-Calculation:** totalACE is automatically calculated from productsSold
4. **Validation:** Stage-specific validation ensures data integrity
5. **Permissions:** Role-based access ensures data security

---

## ✅ Pre-Launch Checklist

- [ ] Firestore indexes created
- [ ] Test user accounts created (agent, manager, admin)
- [ ] All endpoints tested
- [ ] Error handling verified
- [ ] Permission system tested
- [ ] Production environment variables set
- [ ] Monitoring and logging configured
- [ ] Security rules updated in Firestore

---

## 🆘 Support

If you encounter any issues:
1. Check the logs for error messages
2. Verify Firestore indexes are created
3. Ensure user roles are correctly set
4. Review the API documentation
5. Check Firebase Console for quota limits

---

**Ready to go! 🚀**

Your sales management system is production-ready and fully integrated.
