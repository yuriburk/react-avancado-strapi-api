# Strapi application

```
async function changePassword(useremail, password) {
strapi.admin.services.user.findOne({ email: useremail }).then((u) => {
if (u) {
strapi.admin.services.auth
.hashPassword(password)
.then((hashedPassword) => {
strapi
.query("user", "admin")
.update({ id: u.id }, { password: hashedPassword })
.then(() => console.log("Updated successfully."))
.catch((ex) => console.error("Failed to update password.", ex));
})
.catch((ex) =>
console.error("Failed to hash password and update it.", ex)
);
} else {
console.error("Wrong email?? Please check your email");
}
});
}
```
