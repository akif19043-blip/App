-- Hasar ve dağılma hesapları. Roblox'a özgü hiçbir şeye dokunmaz, bu yüzden
-- sunucu, istemci ve testler aynı kodu kullanır.

local Ballistics = {}

local HEAD = { Head = true, Helmet = true }
local TORSO = { UpperTorso = true, LowerTorso = true, Torso = true, HumanoidRootPart = true, Vest = true }

function Ballistics.zoneOf(partName)
	if HEAD[partName] then
		return "head"
	elseif TORSO[partName] then
		return "torso"
	end
	return "limb"
end

function Ballistics.zoneMult(stats, zone)
	if zone == "head" then
		return stats.headMult
	elseif zone == "limb" then
		return stats.limbMult
	end
	return 1
end

function Ballistics.damageAt(stats, distance)
	if distance <= stats.falloffStart then
		return stats.damage
	elseif distance >= stats.falloffEnd then
		return stats.minDamage
	end
	local t = (distance - stats.falloffStart) / (stats.falloffEnd - stats.falloffStart)
	return stats.damage + (stats.minDamage - stats.damage) * t
end

function Ballistics.damageFor(stats, distance, partName)
	local zone = Ballistics.zoneOf(partName)
	return Ballistics.damageAt(stats, distance) * Ballistics.zoneMult(stats, zone), zone
end

-- state: aim (0..1), moving (0..1), crouching, airborne, bloom (derece)
function Ballistics.spreadDegrees(stats, state)
	local aim = state.aim or 0
	local base = stats.hipSpread + (stats.adsSpread - stats.hipSpread) * aim
	local hipShare = 1 - aim * 0.85
	local extra = (state.bloom or 0) * (1 - aim * 0.6)
	extra += (state.moving or 0) * 1.2 * hipShare
	if state.airborne then
		extra += 3.5
	end
	local total = base + extra
	if state.crouching then
		total *= 0.75
	end
	return total
end

-- Verilen yönü, tepe açısı "degrees" olan koninin içinde rastgele saptırır.
-- r1 ve r2, 0..1 arasında iki rastgele sayıdır.
function Ballistics.spreadDirection(direction, degrees, r1, r2)
	if degrees <= 0 then
		return direction
	end
	local angle = math.rad(degrees) * math.sqrt(r1)
	local roll = r2 * math.pi * 2
	local base = CFrame.lookAt(Vector3.zero, direction)
	local offset = CFrame.Angles(0, 0, roll) * CFrame.Angles(angle, 0, 0)
	return (base * offset).LookVector
end

return Ballistics
