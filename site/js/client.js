var paginationData = { 
	pageSize:5, 
	currPage:1,
	count:0,
	init:function(count){
		this.count = count;
		this.currPage = this.pages();
	},
	isLastPage: function(){
		return this.currentPage()==this.pages();
	},
	pages:function(){
		return Math.ceil(this.count/this.pageSize);
	},
	currentPage:function(){
		if(this.currPage>this.pages()){
			this.currPage = this.pages();
		}

		return this.currPage;
	},
	incCount:function(){
		this.count++;
		if(this.currPage==0){
			this.currPage=1;
		}
	},
	decCount:function(){
		this.count--;
	}
};

$(function() {
	$.get( "/getCuentas", function( data ) {
		data.forEach(function(entry){
			addCuentaDiv(entry);
		});
	});

	$("#addCuenta").ajaxForm({
		url: '/addCuenta', 
		dataType: 'json',
		resetForm: true,
		beforeSubmit:function(formData, jqForm, options){
			if(!formData[0].value){
				return false;
			}
			return true;
		},
		success: function(data,status,xhr,form) {
			addCuentaDiv(data);
    	}
	});
});

function addCuentaDiv(cuenta){
	$.get( "/countEntradas?idCuenta="+cuenta._id, function( data ) {
		
		paginationData.init(data.count);

		var template = $("#cuenta_template").html();			
	  	var result = Mustache.render(template,cuenta);

		$("#cuentas").append(result);

		actualizarTotal(cuenta._id);	

		//Paginado
		$('#pagination_'+cuenta._id).bootpag({
		    total: paginationData.pages(),
		    page: paginationData.currentPage(),
		}	).on("page", function(event, num){
			paginationData.currPage = num;
			showCurrentRowPage(cuenta);
		});
		showCurrentRowPage(cuenta);

		$("#cuenta_delete"+cuenta._id).ajaxForm({
			url: '/removeCuenta',
			dataType: 'html',
			success: function(data,status,xhr,form){
				$("#cuenta_"+cuenta._id).remove();
			}
		});

		$("#cuenta_newEntry"+cuenta._id).ajaxForm({
			url: '/addEntrada',
			dataType: 'json',
			resetForm: true,
			beforeSubmit:function(formData, jqForm, options){
				if(!formData[1].value){
					return false;
				}
				if(isNaN(parseFloat(formData[2].value))){
					return false;
				}
				return true;
			},
			success: function(data,status,xhr,form){
				appendRowToTable(data);
			}
		});
	});
}

function showCurrentRowPage(cuenta){
	$.get( 	"/getEntradas?idCuenta="+cuenta._id+
					"&offset="+
					(paginationData.currentPage()-1)*(paginationData.pageSize)+
					"&size="+paginationData.pageSize, function( data ) {
		cuenta.entradas = data;

		var template = $("#entradas_rows_template").html();			
			var result = Mustache.render(template,cuenta);
		$("#cuenta_entradas_"+cuenta._id+">tbody").html(result);

		cuenta.entradas.forEach(function(entrada){
			ajaxFormOnEntrada(entrada);

		});
	});

}

function appendRowToTable(entrada){
	paginationData.incCount();
	if(paginationData.isLastPage()){
		var template = $("#entrada_row_template").html();
	  	var result = Mustache.render(template,entrada);

		$("#cuenta_entradas_"+entrada.cuenta+">tbody:last")
			.append(result);

		ajaxFormOnEntrada(entrada);

		actualizarTotal(entrada.cuenta);
	}
}

function ajaxFormOnEntrada(entrada){
	$("#entrada_delete"+entrada._id).ajaxForm({
		url: '/removeEntrada',
		dataType: 'json',
		resetForm: true,
		success: function(data,status,xhr,form){
			removeRowFromTable(entrada.cuenta,data.id);
			
			$("#cuenta_newEntry_"+entrada._id+">input[name='desc']")
				.focus();
		}
	});
}

function removeRowFromTable(cuentaId,entradaId){
	$("#entrada_row_"+entradaId).remove();

	actualizarTotal(cuentaId);

	paginationData.decCount();
	$('#pagination_'+cuentaId).bootpag({
		total: paginationData.pages()
	});
	showCurrentRowPage({ _id:cuentaId });
}

function actualizarTotal(cuentaId){
	$.get( "/getTotalCuenta?id="+cuentaId, function( data ) {
		$("#cuenta_total_"+cuentaId)
			.html(data.total);
	});
}