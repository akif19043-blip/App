-- Silah modelleri kodla, parçalardan kurulur; indirilen hazır model yok.
-- Aynı kurucu hem birinci şahıs görünümünde (kamera önündeki silah) hem de
-- karakterin elindeki silahta kullanılır.
--
-- Model uzayı: namlu -Z yönüne bakar, +Y yukarıdır, "Handle" parçası tabanca
-- kabzasının üstündedir.

local GunModels = {}

local DARK = Color3.fromRGB(28, 28, 30)
local STEEL = Color3.fromRGB(46, 47, 50)
local HOLE = Color3.fromRGB(12, 12, 12)
local GLASS = Color3.fromRGB(120, 200, 255)
local LENS = Color3.fromRGB(70, 110, 150)

local function newPart(model, name, size, cframe, color, material)
	local part = Instance.new("Part")
	part.Name = name
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = material or Enum.Material.Metal
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.Massless = true
	part.CastShadow = false
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = model
	return part
end

local function box(model, name, sx, sy, sz, x, y, z, color, material)
	return newPart(model, name, Vector3.new(sx, sy, sz), CFrame.new(x, y, z), color, material)
end

-- Z ekseni boyunca uzanan silindir (namlu, dürbün gövdesi...)
local function tube(model, name, length, diameter, x, y, zCenter, color, material)
	local part = newPart(
		model,
		name,
		Vector3.new(length, diameter, diameter),
		CFrame.new(x, y, zCenter) * CFrame.Angles(0, math.rad(90), 0),
		color,
		material
	)
	part.Shape = Enum.PartType.Cylinder
	return part
end

local LONG = {
	rifle = { stock = 0.27, recv = 0.3, guard = 0.27, barrel = 0.16, mag = { 0.2, 0.72, 0.34, 14 } },
	carbine = { stock = 0.25, recv = 0.36, guard = 0.27, barrel = 0.12, mag = { 0.2, 0.66, 0.34, 18 } },
	smg = { stock = 0.3, recv = 0.42, guard = 0.18, barrel = 0.1, mag = { 0.16, 0.8, 0.24, 0 }, wire = true },
	dmr = { stock = 0.27, recv = 0.28, guard = 0.25, barrel = 0.2, mag = { 0.2, 0.5, 0.4, 6 } },
	sniper = { stock = 0.27, recv = 0.25, guard = 0.2, barrel = 0.28, mag = { 0.2, 0.3, 0.42, 0 }, bolt = true },
	lmg = { stock = 0.25, recv = 0.3, guard = 0.2, barrel = 0.25, mag = { 0.5, 0.5, 0.6, 0 }, bipod = true },
	shotgun = { stock = 0.3, recv = 0.25, guard = 0.3, barrel = 0.15, pump = true },
}

local function buildSight(model, sightId, stats, zRear, zFront, railY, color)
	local aim
	if stats.scope and sightId ~= "scope4" then
		-- Keskin nişancı dürbünü
		local zc = (zRear + zFront) / 2 + 0.25
		tube(model, "Scope", 1.35, 0.26, 0, railY + 0.2, zc, DARK)
		tube(model, "ScopeFront", 0.3, 0.34, 0, railY + 0.2, zc - 0.7, DARK)
		tube(model, "ScopeRear", 0.2, 0.3, 0, railY + 0.2, zc + 0.68, DARK)
		tube(model, "ScopeLens", 0.02, 0.28, 0, railY + 0.2, zc - 0.86, LENS, Enum.Material.Glass)
		tube(model, "ScopeTurret", 0.14, 0.12, 0, railY + 0.36, zc, STEEL).CFrame = CFrame.new(0, railY + 0.36, zc)
			* CFrame.Angles(0, 0, math.rad(90))
		tube(model, "ScopeTurret", 0.14, 0.12, 0, railY + 0.2, zc, STEEL).CFrame = CFrame.new(0.17, railY + 0.2, zc)
		box(model, "Mount1", 0.12, 0.12, 0.14, 0, railY + 0.04, zc - 0.35, DARK)
		box(model, "Mount2", 0.12, 0.12, 0.14, 0, railY + 0.04, zc + 0.35, DARK)
		aim = Vector3.new(0, railY + 0.2, zc + 0.78)
	elseif sightId == "scope4" then
		local zc = zRear - 0.55
		tube(model, "Scope", 0.85, 0.22, 0, railY + 0.17, zc, DARK)
		tube(model, "ScopeFront", 0.16, 0.27, 0, railY + 0.17, zc - 0.45, DARK)
		tube(model, "ScopeLens", 0.02, 0.23, 0, railY + 0.17, zc - 0.54, LENS, Enum.Material.Glass)
		box(model, "Mount1", 0.12, 0.1, 0.4, 0, railY + 0.03, zc, DARK)
		aim = Vector3.new(0, railY + 0.17, zc + 0.43)
	elseif sightId == "reddot" or sightId == "holo" then
		local wide = sightId == "holo"
		local w = wide and 0.3 or 0.22
		local h = wide and 0.24 or 0.2
		local zc = zRear - 0.5
		box(model, "SightBase", w, 0.05, 0.34, 0, railY + 0.025, zc, DARK)
		box(model, "SightL", 0.03, h, 0.06, -w / 2 + 0.015, railY + 0.05 + h / 2, zc - 0.12, DARK)
		box(model, "SightR", 0.03, h, 0.06, w / 2 - 0.015, railY + 0.05 + h / 2, zc - 0.12, DARK)
		box(model, "SightTop", w, 0.03, 0.06, 0, railY + 0.05 + h, zc - 0.12, DARK)
		local lens =
			box(model, "Lens", w - 0.06, h - 0.03, 0.01, 0, railY + 0.05 + h / 2, zc - 0.12, GLASS, Enum.Material.Glass)
		lens.Transparency = 0.85
		local dot = box(
			model,
			"Dot",
			0.018,
			0.018,
			0.012,
			0,
			railY + 0.05 + h / 2,
			zc - 0.115,
			Color3.fromRGB(255, 40, 40),
			Enum.Material.Neon
		)
		dot.Name = "Dot"
		aim = Vector3.new(0, railY + 0.05 + h / 2, zc + 0.1)
	else
		-- Demir nişangâh: arkada çatal, önde arpacık
		box(model, "RearL", 0.03, 0.1, 0.05, -0.05, railY + 0.05, zRear - 0.2, DARK)
		box(model, "RearR", 0.03, 0.1, 0.05, 0.05, railY + 0.05, zRear - 0.2, DARK)
		box(model, "RearBase", 0.14, 0.03, 0.08, 0, railY + 0.015, zRear - 0.2, DARK)
		box(model, "FrontPost", 0.025, 0.11, 0.04, 0, railY + 0.055, zFront + 0.1, DARK)
		box(model, "FrontBase", 0.1, 0.03, 0.1, 0, railY + 0.015, zFront + 0.1, color)
		aim = Vector3.new(0, railY + 0.085, zRear)
	end
	return aim
end

local function buildLong(model, stats, layout, info)
	local spec = stats.model
	local color, accent = spec.color, spec.accent
	local atts = stats.attachments or {}
	local length = spec.length

	local stockLen = length * layout.stock
	local recvLen = length * layout.recv
	local guardLen = length * layout.guard
	local barrelLen = length * layout.barrel
	if atts.barrel == "longbarrel" then
		barrelLen += 0.38
	end

	local railY = 0.46
	local axisY = 0.3
	local zRecvRear = 0.45
	local zRecvFront = zRecvRear - recvLen
	local zGuardFront = zRecvFront - guardLen
	local zMuzzle = zGuardFront - barrelLen

	-- Gövde
	box(model, "Receiver", 0.26, 0.42, recvLen, 0, 0.25, (zRecvRear + zRecvFront) / 2, color)
	box(model, "Rail", 0.12, 0.04, recvLen * 0.9, 0, railY - 0.02, (zRecvRear + zRecvFront) / 2, DARK)

	-- Kabza
	newPart(
		model,
		"Grip",
		Vector3.new(0.2, 0.58, 0.28),
		CFrame.new(0, -0.22, 0.14) * CFrame.Angles(math.rad(-14), 0, 0),
		DARK,
		Enum.Material.Plastic
	)
	box(model, "TriggerGuard", 0.06, 0.04, 0.34, 0, -0.06, -0.2, DARK)

	-- El kundağı ve namlu
	if layout.pump then
		tube(model, "Barrel", guardLen + barrelLen, 0.14, 0, axisY + 0.06, (zRecvFront + zMuzzle) / 2, DARK)
		tube(
			model,
			"TubeMag",
			guardLen + barrelLen * 0.6,
			0.13,
			0,
			axisY - 0.1,
			zRecvFront - (guardLen + barrelLen * 0.6) / 2,
			DARK
		)
		box(
			model,
			"Pump",
			0.24,
			0.2,
			guardLen * 0.55,
			0,
			axisY - 0.1,
			zRecvFront - guardLen * 0.5,
			accent,
			Enum.Material.Wood
		)
	else
		box(
			model,
			"Handguard",
			0.24,
			0.3,
			guardLen,
			0,
			axisY,
			(zRecvFront + zGuardFront) / 2,
			accent,
			Enum.Material.Plastic
		)
		tube(model, "Barrel", barrelLen + 0.1, 0.1, 0, axisY, (zGuardFront + zMuzzle) / 2 + 0.05, DARK)
	end

	-- Dipçik
	local zStockRear = zRecvRear + stockLen
	if layout.wire then
		box(model, "StockTop", 0.05, 0.05, stockLen, 0, 0.36, zRecvRear + stockLen / 2, DARK)
		box(model, "StockBottom", 0.05, 0.05, stockLen, 0, 0.1, zRecvRear + stockLen / 2, DARK)
		box(model, "StockPad", 0.1, 0.4, 0.07, 0, 0.22, zStockRear, DARK)
	else
		local stockColor = layout.pump and accent or color
		local stockMaterial = layout.pump and Enum.Material.Wood or Enum.Material.Plastic
		box(model, "StockTube", 0.14, 0.16, stockLen * 0.5, 0, 0.3, zRecvRear + stockLen * 0.25, DARK)
		box(model, "Stock", 0.2, 0.4, stockLen * 0.6, 0, 0.2, zRecvRear + stockLen * 0.7, stockColor, stockMaterial)
		box(model, "StockPad", 0.22, 0.46, 0.06, 0, 0.19, zStockRear, DARK, Enum.Material.Rubber)
	end

	-- Şarjör
	if layout.mag then
		local mw, mh, md, tilt = layout.mag[1], layout.mag[2], layout.mag[3], layout.mag[4]
		if atts.mag == "extmag" then
			mh *= 1.3
		end
		local zMag = zRecvFront + recvLen * 0.28
		local magColor = atts.mag == "fastmag" and accent or DARK
		-- Üst yarısı düz, alt yarısı biraz daha eğik: kavisli şarjör görünümü
		local top = CFrame.new(0, 0.02, zMag) * CFrame.Angles(math.rad(tilt * 0.6), 0, 0)
		local upper = newPart(
			model,
			"Mag",
			Vector3.new(mw, mh * 0.52, md),
			top * CFrame.new(0, -mh * 0.26, 0),
			magColor,
			Enum.Material.Metal
		)
		local bend = top * CFrame.new(0, -mh * 0.5, 0) * CFrame.Angles(math.rad(tilt * 0.8), 0, 0)
		local lower = newPart(
			model,
			"Mag",
			Vector3.new(mw, mh * 0.52, md),
			bend * CFrame.new(0, -mh * 0.24, 0),
			magColor,
			Enum.Material.Metal
		)
		local plate = newPart(
			model,
			"Mag",
			Vector3.new(mw + 0.04, 0.05, md + 0.05),
			bend * CFrame.new(0, -mh * 0.5, 0),
			STEEL,
			Enum.Material.Metal
		)
		for _, part in ipairs({ upper, lower, plate }) do
			part:SetAttribute("Mag", true)
		end
	end

	if layout.bolt then
		tube(model, "Bolt", 0.3, 0.06, 0.2, 0.34, zRecvRear - recvLen * 0.4, DARK).CFrame =
			CFrame.new(0.22, 0.34, zRecvRear - recvLen * 0.4)
		local knob = newPart(
			model,
			"BoltKnob",
			Vector3.new(0.12, 0.12, 0.12),
			CFrame.new(0.38, 0.32, zRecvRear - recvLen * 0.4),
			STEEL,
			Enum.Material.Metal
		)
		knob.Shape = Enum.PartType.Ball
	end
	if layout.bipod then
		box(model, "BipodL", 0.04, 0.5, 0.04, -0.12, axisY - 0.38, zGuardFront + 0.1, DARK)
		box(model, "BipodR", 0.04, 0.5, 0.04, 0.12, axisY - 0.38, zGuardFront + 0.1, DARK)
	end

	-- Ayrıntılar: ray dişleri, atım penceresi, kurma kolu, tetik, havalandırma, gaz bloğu
	for zTooth = zRecvRear - 0.1, zRecvFront + recvLen * 0.1, -0.15 do
		box(model, "RailTooth", 0.13, 0.03, 0.06, 0, railY + 0.012, zTooth, STEEL)
	end
	box(
		model,
		"EjectionPort",
		0.02,
		0.13,
		math.min(0.42, recvLen * 0.35),
		0.135,
		0.33,
		zRecvRear - recvLen * 0.38,
		HOLE
	)
	box(model, "PortCover", 0.025, 0.04, math.min(0.42, recvLen * 0.35), 0.137, 0.25, zRecvRear - recvLen * 0.38, STEEL)
	box(model, "ChargingHandle", 0.2, 0.05, 0.1, 0, railY - 0.03, zRecvRear + 0.05, STEEL)
	box(model, "MagWell", 0.24, 0.12, 0.38, 0, 0.02, zRecvFront + recvLen * 0.28, color)
	newPart(
		model,
		"Trigger",
		Vector3.new(0.035, 0.15, 0.05),
		CFrame.new(0, -0.02, -0.2) * CFrame.Angles(math.rad(18), 0, 0),
		STEEL,
		Enum.Material.Metal
	)
	box(model, "SelectorL", 0.02, 0.05, 0.08, -0.135, 0.15, 0.12, STEEL)
	box(model, "SelectorR", 0.02, 0.05, 0.08, 0.135, 0.15, 0.12, STEEL)
	if not layout.pump then
		for index = 1, 3 do
			for _, side in ipairs({ -1, 1 }) do
				box(
					model,
					"Vent",
					0.02,
					0.08,
					guardLen * 0.16,
					side * 0.122,
					axisY + 0.04,
					zRecvFront - guardLen * index / 4,
					HOLE
				)
			end
		end
		box(model, "GuardRail", 0.08, 0.03, guardLen * 0.9, 0, axisY + 0.165, (zRecvFront + zGuardFront) / 2, STEEL)
		box(model, "GasBlock", 0.13, 0.13, 0.12, 0, axisY + 0.02, zGuardFront - 0.08, STEEL)
	else
		for index = 0, 3 do
			box(
				model,
				"PumpGroove",
				0.25,
				0.21,
				0.02,
				0,
				axisY - 0.1,
				zRecvFront - guardLen * (0.3 + index * 0.12),
				HOLE
			)
		end
	end
	if layout.bipod then
		-- Taşıma kolu
		box(model, "CarryHandle", 0.06, 0.06, recvLen * 0.5, 0, railY + 0.22, zRecvFront + recvLen * 0.5, STEEL)
		box(model, "CarryPost", 0.06, 0.2, 0.06, 0, railY + 0.1, zRecvFront + recvLen * 0.27, STEEL)
		box(model, "CarryPost", 0.06, 0.2, 0.06, 0, railY + 0.1, zRecvFront + recvLen * 0.73, STEEL)
	end
	if not layout.wire then
		box(
			model,
			"Cheek",
			0.17,
			0.07,
			stockLen * 0.32,
			0,
			0.43,
			zRecvRear + stockLen * 0.66,
			DARK,
			Enum.Material.Rubber
		)
		tube(model, "Swivel", 0.04, 0.09, 0, 0.0, zRecvRear + stockLen * 0.75, STEEL).CFrame = CFrame.new(
			0,
			-0.02,
			zRecvRear + stockLen * 0.75
		) * CFrame.Angles(0, 0, math.rad(90))
	end

	-- Namlu eklentisi
	local muzzleY = layout.pump and axisY + 0.06 or axisY
	if not atts.barrel and not layout.pump then
		-- Alev gizleyici (yarıklı uç)
		tube(model, "FlashHider", 0.2, 0.13, 0, muzzleY, zMuzzle - 0.1, STEEL)
		for _, side in ipairs({ -1, 1 }) do
			box(model, "HiderSlot", 0.02, 0.03, 0.14, side * 0.06, muzzleY, zMuzzle - 0.11, HOLE)
		end
		zMuzzle -= 0.2
	end
	if atts.barrel == "suppressor" then
		tube(model, "Suppressor", 0.62, 0.17, 0, muzzleY, zMuzzle - 0.31, DARK)
		zMuzzle -= 0.62
	elseif atts.barrel == "compensator" then
		tube(model, "Compensator", 0.22, 0.16, 0, muzzleY, zMuzzle - 0.11, DARK)
		zMuzzle -= 0.22
	end

	-- Kabza eklentisi
	local zGuardMid = (zRecvFront + zGuardFront) / 2
	if atts.grip == "vgrip" then
		box(model, "ForeGrip", 0.14, 0.4, 0.14, 0, axisY - 0.35, zGuardMid, DARK, Enum.Material.Plastic)
	elseif atts.grip == "agrip" then
		newPart(
			model,
			"ForeGrip",
			Vector3.new(0.14, 0.14, 0.42),
			CFrame.new(0, axisY - 0.24, zGuardMid) * CFrame.Angles(math.rad(22), 0, 0),
			DARK,
			Enum.Material.Plastic
		)
	elseif atts.grip == "laser" then
		box(model, "Laser", 0.1, 0.1, 0.26, 0.17, axisY, zGuardMid, DARK)
		box(
			model,
			"LaserLens",
			0.05,
			0.05,
			0.02,
			0.17,
			axisY,
			zGuardMid - 0.14,
			Color3.fromRGB(80, 255, 90),
			Enum.Material.Neon
		)
	end

	info.aim = buildSight(model, atts.sight, stats, zRecvRear, zGuardFront, railY, color)
	info.muzzle = Vector3.new(0, muzzleY, zMuzzle)
	info.leftHand = Vector3.new(0, axisY - 0.2, zGuardMid)
	info.rightHand = Vector3.new(0, -0.2, 0.12)
end

local function buildPistol(model, stats, info)
	local spec = stats.model
	local atts = stats.attachments or {}
	local length = spec.length
	local zRear = 0.3
	local zFront = zRear - length

	box(model, "Slide", 0.2, 0.2, length, 0, 0.22, (zRear + zFront) / 2, spec.color)
	box(model, "Frame", 0.18, 0.12, length * 0.8, 0, 0.07, zRear - length * 0.45, spec.accent)
	newPart(
		model,
		"Grip",
		Vector3.new(0.18, 0.56, 0.26),
		CFrame.new(0, -0.2, 0.16) * CFrame.Angles(math.rad(-12), 0, 0),
		spec.accent,
		Enum.Material.Plastic
	)
	box(model, "TriggerGuard", 0.05, 0.04, 0.26, 0, -0.07, -0.12, spec.accent)
	newPart(
		model,
		"Trigger",
		Vector3.new(0.03, 0.12, 0.04),
		CFrame.new(0, -0.01, -0.09) * CFrame.Angles(math.rad(15), 0, 0),
		STEEL,
		Enum.Material.Metal
	)
	-- Kayar parça tırtıkları, namlu ucu, horoz
	for index = 0, 4 do
		for _, side in ipairs({ -1, 1 }) do
			box(model, "Serration", 0.02, 0.14, 0.025, side * 0.1, 0.23, zRear - 0.04 - index * 0.05, HOLE)
		end
	end
	tube(model, "BarrelTip", 0.03, 0.08, 0, 0.22, zFront - 0.005, HOLE)
	box(model, "Hammer", 0.05, 0.08, 0.05, 0, 0.3, zRear + 0.02, STEEL)
	box(model, "GripPanel", 0.19, 0.4, 0.2, 0, -0.18, 0.16, DARK, Enum.Material.Rubber).CFrame = CFrame.new(
		0,
		-0.18,
		0.165
	) * CFrame.Angles(math.rad(-12), 0, 0)
	if atts.mag == "extmag" then
		local mag = box(model, "Mag", 0.14, 0.26, 0.2, 0, -0.58, 0.22, DARK)
		mag:SetAttribute("Mag", true)
	end

	local zMuzzle = zFront
	if atts.barrel == "suppressor" then
		tube(model, "Suppressor", 0.5, 0.15, 0, 0.22, zFront - 0.25, DARK)
		zMuzzle -= 0.5
	end
	if atts.grip == "laser" then
		box(model, "Laser", 0.1, 0.1, 0.2, 0, 0.02, zFront + 0.18, DARK)
		box(
			model,
			"LaserLens",
			0.05,
			0.05,
			0.02,
			0,
			0.02,
			zFront + 0.07,
			Color3.fromRGB(80, 255, 90),
			Enum.Material.Neon
		)
	end

	if atts.sight == "reddot" then
		local zc = zRear - 0.22
		box(model, "SightBase", 0.16, 0.04, 0.2, 0, 0.34, zc, DARK)
		box(model, "SightL", 0.025, 0.16, 0.04, -0.07, 0.44, zc - 0.07, DARK)
		box(model, "SightR", 0.025, 0.16, 0.04, 0.07, 0.44, zc - 0.07, DARK)
		box(model, "SightTop", 0.16, 0.025, 0.04, 0, 0.52, zc - 0.07, DARK)
		box(model, "Dot", 0.016, 0.016, 0.012, 0, 0.44, zc - 0.07, Color3.fromRGB(255, 40, 40), Enum.Material.Neon)
		info.aim = Vector3.new(0, 0.44, zc + 0.1)
	else
		box(model, "RearL", 0.03, 0.06, 0.04, -0.05, 0.35, zRear - 0.05, DARK)
		box(model, "RearR", 0.03, 0.06, 0.04, 0.05, 0.35, zRear - 0.05, DARK)
		box(model, "FrontPost", 0.025, 0.06, 0.04, 0, 0.35, zFront + 0.06, DARK)
		info.aim = Vector3.new(0, 0.365, zRear)
	end

	info.muzzle = Vector3.new(0, 0.22, zMuzzle)
	info.leftHand = Vector3.new(-0.08, -0.3, 0.1)
	info.rightHand = Vector3.new(0, -0.2, 0.14)
end

local function buildKnife(model, stats, info)
	local spec = stats.model
	box(model, "KnifeGrip", 0.14, 0.2, 0.46, 0, 0, 0.05, spec.accent, Enum.Material.Rubber)
	box(model, "Guard", 0.2, 0.3, 0.05, 0, 0, -0.2, DARK)
	box(model, "Blade", 0.04, 0.2, spec.length * 0.7, 0, 0.01, -0.22 - spec.length * 0.35, spec.color)
	box(
		model,
		"Edge",
		0.02,
		0.05,
		spec.length * 0.68,
		0,
		-0.08,
		-0.22 - spec.length * 0.35,
		Color3.fromRGB(220, 224, 228)
	)
	box(
		model,
		"Fuller",
		0.045,
		0.04,
		spec.length * 0.4,
		0,
		0.05,
		-0.3 - spec.length * 0.2,
		Color3.fromRGB(120, 124, 128)
	)
	box(model, "Pommel", 0.16, 0.22, 0.06, 0, 0, 0.3, STEEL)
	for index = 0, 3 do
		box(model, "GripRing", 0.15, 0.21, 0.02, 0, 0, -0.1 + index * 0.1, HOLE)
	end
	newPart(
		model,
		"Tip",
		Vector3.new(0.04, 0.14, 0.2),
		CFrame.new(0, 0.03, -0.22 - spec.length * 0.7 - 0.08) * CFrame.Angles(math.rad(-14), 0, 0),
		spec.color
	)
	info.aim = Vector3.new(0, 0.2, 0.3)
	info.muzzle = Vector3.new(0, 0, -0.22 - spec.length * 0.7)
	info.leftHand = nil
	info.rightHand = Vector3.new(0, -0.05, 0.1)
end

-- stats: Weapons.resolve çıktısı. options.world = true ise parçalar kaynaklanır
-- (karakterin eline takmak için), yoksa sabitlenir (kamera önünde her karede
-- yeri kodla verilir).
function GunModels.build(stats, options)
	options = options or {}
	local model = Instance.new("Model")
	model.Name = options.name or "Gun"

	local handle = newPart(model, "Handle", Vector3.new(0.2, 0.2, 0.2), CFrame.new(), DARK)
	handle.Transparency = 1
	model.PrimaryPart = handle

	local info = { style = stats.model.style }
	local style = stats.model.style
	if style == "pistol" then
		buildPistol(model, stats, info)
	elseif style == "knife" then
		buildKnife(model, stats, info)
	else
		buildLong(model, stats, LONG[style] or LONG.rifle, info)
	end

	local muzzle = Instance.new("Attachment")
	muzzle.Name = "Muzzle"
	muzzle.Position = info.muzzle
	muzzle.Parent = handle

	local aim = Instance.new("Attachment")
	aim.Name = "Aim"
	aim.Position = info.aim
	aim.Parent = handle

	for _, child in ipairs(model:GetChildren()) do
		if child:IsA("BasePart") then
			if options.world then
				child.Anchored = false
				if child ~= handle then
					local weld = Instance.new("WeldConstraint")
					weld.Part0 = handle
					weld.Part1 = child
					weld.Parent = child
				end
			else
				child.Anchored = true
			end
		end
	end

	return model, info
end

return GunModels
