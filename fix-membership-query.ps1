# Fix all userId_venueId queries to use findFirst instead of findUnique

$files = @(
    "app\api\venues\[venueId]\staff\[membershipId]\route.ts",
    "app\api\venues\[venueId]\tasks\[taskId]\route.ts",
    "app\api\venues\[venueId]\tasks\route.ts",
    "app\api\venues\[venueId]\staff\route.ts",
    "app\api\venues\[venueId]\transactions\route.ts",
    "app\api\venues\[venueId]\events\route.ts",
    "app\api\venues\[venueId]\settings\route.ts",
    "app\api\venues\[venueId]\services\[serviceId]\route.ts",
    "app\api\venues\[venueId]\services\route.ts",
    "app\api\venues\[venueId]\roles\[roleId]\route.ts",
    "app\api\venues\[venueId]\roles\route.ts",
    "app\api\venues\[venueId]\events\[eventId]\route.ts"
)

foreach ($file in $files) {
    $content = Get-Content $file -Raw

    # Replace findUnique with findFirst
    $content = $content -replace 'prisma\.membership\.findUnique\(\s*\{\s*where:\s*\{\s*userId_venueId:\s*\{', 'prisma.membership.findFirst({ where: {'

    # Remove the nested userId_venueId object structure
    $content = $content -replace 'userId_venueId:\s*\{\s*userId:\s*([^,]+),\s*venueId([^}]*)\s*\},', 'userId: $1, venueId$2,'

    Set-Content $file $content -NoNewline
    Write-Host "Fixed: $file"
}

Write-Host "All files fixed!"
