// Synthetic entitlement for browser tests; never contacts production auth.
export async function mockOfflineAccess(context,owner){
 await context.addInitScript(owner=>{localStorage.setItem(`teacherco-access:${owner}`,JSON.stringify({owner,status:'active',expiresAt:null,checkedAt:Date.now(),clientCheckedAt:Date.now()}));},owner);
 await context.route('**/api/access',route=>route.fulfill({json:{owner,status:'active',expiresAt:null,checkedAt:Date.now()}}));
}
